/**
 * Read Replica Pool
 * Advanced database connection pooling with read/write splitting and smart query routing
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import Redis from 'ioredis';
import crypto from 'crypto';
import { ConnectionManager, createConnectionManagerFromEnv } from './connection-manager';
import { QueryAnalyzer, QueryType, ConsistencyLevel } from './query-analyzer';
import { ReplicationMonitor, createReplicationMonitor } from './replication-monitor';

export interface QueryOptions {
  forceWrite?: boolean;
  consistency?: ConsistencyLevel;
  cached?: boolean;
  cacheTimeout?: number;
  timeout?: number;
  retryOnFailure?: boolean;
  maxRetries?: number;
  sessionId?: string;
  userId?: string;
}

export interface TransactionOptions {
  isolationLevel?: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
  readOnly?: boolean;
  deferrable?: boolean;
}

export interface CacheConfig {
  enabled: boolean;
  redis?: Redis;
  defaultTimeout?: number;
  maxCacheSize?: number;
  compressionThreshold?: number;
}

export interface DatabaseStats {
  totalQueries: number;
  readQueries: number;
  writeQueries: number;
  cachedQueries: number;
  cacheHits: number;
  cacheMisses: number;
  averageQueryTime: number;
  averageReadTime: number;
  averageWriteTime: number;
  connectionPoolStats: Map<string, any>;
  replicationLag: Map<string, number>;
  errors: number;
  lastError?: string;
}

export class ReadReplicaPool extends EventEmitter {
  private connectionManager: ConnectionManager;
  private queryAnalyzer: QueryAnalyzer;
  private replicationMonitor?: ReplicationMonitor;
  private redis?: Redis;
  private stats: DatabaseStats;
  private sessionStickiness: Map<string, string> = new Map(); // sessionId -> poolName
  private preparedStatements: Map<string, boolean> = new Map(); // statementName -> isPrepared
  private queryCache: Map<string, { result: any; timestamp: number; hits: number }> = new Map();
  private cacheConfig: CacheConfig;
  private isShuttingDown = false;

  constructor(connectionManager?: ConnectionManager, cacheConfig?: CacheConfig) {
    super();

    this.connectionManager = connectionManager || createConnectionManagerFromEnv();
    this.queryAnalyzer = new QueryAnalyzer();

    this.cacheConfig = {
      enabled: cacheConfig?.enabled ?? true,
      redis: cacheConfig?.redis,
      defaultTimeout: cacheConfig?.defaultTimeout || 300000, // 5 minutes
      maxCacheSize: cacheConfig?.maxCacheSize || 1000,
      compressionThreshold: cacheConfig?.compressionThreshold || 1024, // 1KB
    };

    if (this.cacheConfig.enabled && this.cacheConfig.redis) {
      this.redis = this.cacheConfig.redis;
    }

    this.stats = {
      totalQueries: 0,
      readQueries: 0,
      writeQueries: 0,
      cachedQueries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageQueryTime: 0,
      averageReadTime: 0,
      averageWriteTime: 0,
      connectionPoolStats: new Map(),
      replicationLag: new Map(),
      errors: 0,
    };

    this.setupEventHandlers();
    this.startCacheCleanup();
  }

  private setupEventHandlers(): void {
    // Connection manager events
    this.connectionManager.on('error', (event) => {
      this.stats.errors++;
      this.stats.lastError = event.error?.message;
      this.emit('pool-error', event);
    });

    this.connectionManager.on('recovery', (event) => {
      this.emit('pool-recovery', event);
    });

    this.connectionManager.on('promotion', (event) => {
      // Clear session stickiness when a replica is promoted
      this.sessionStickiness.clear();
      this.emit('replica-promotion', event);
    });

    this.connectionManager.on('high-lag', (event) => {
      this.emit('high-replication-lag', event);
    });
  }

  private startCacheCleanup(): void {
    // Clean up expired cache entries every minute
    setInterval(() => {
      if (this.isShuttingDown) return;

      const now = Date.now();
      const expiredKeys: string[] = [];

      for (const [key, value] of this.queryCache) {
        if (now - value.timestamp > this.cacheConfig.defaultTimeout!) {
          expiredKeys.push(key);
        }
      }

      for (const key of expiredKeys) {
        this.queryCache.delete(key);
      }

      // Limit cache size
      if (this.queryCache.size > this.cacheConfig.maxCacheSize!) {
        const entries = Array.from(this.queryCache.entries());
        // Sort by hits (least used first) and timestamp (oldest first)
        entries.sort((a, b) => {
          if (a[1].hits !== b[1].hits) {
            return a[1].hits - b[1].hits;
          }
          return a[1].timestamp - b[1].timestamp;
        });

        // Remove least used entries
        const toRemove = entries.slice(0, entries.length - this.cacheConfig.maxCacheSize!);
        for (const [key] of toRemove) {
          this.queryCache.delete(key);
        }
      }
    }, 60000); // Every minute
  }

  /**
   * Setup replication monitoring
   */
  public setupReplicationMonitoring(primaryPool: Pool, replicaPools: Map<string, Pool>): void {
    this.replicationMonitor = createReplicationMonitor(primaryPool, replicaPools, {
      checkInterval: 10000,
      maxAcceptableLag: 1000,
      alertThreshold: 5000,
    });

    this.replicationMonitor.on('high-lag', (event) => {
      this.emit('replication-lag-alert', event);
    });

    this.replicationMonitor.on('unhealthy-replica', (event) => {
      // Remove unhealthy replica from session stickiness
      for (const [sessionId, poolName] of this.sessionStickiness) {
        if (poolName === event.replica) {
          this.sessionStickiness.delete(sessionId);
        }
      }
    });

    this.replicationMonitor.start();
  }

  /**
   * Execute a query with smart routing
   */
  public async query<T extends QueryResultRow = any>(
    text: string,
    params?: any[],
    options?: QueryOptions
  ): Promise<QueryResult<T>> {
    const startTime = performance.now();

    try {
      // Analyze the query
      const analysis = this.queryAnalyzer.analyze(text, params, {
        sessionId: options?.sessionId,
        userId: options?.userId,
      });

      // Update stats
      this.stats.totalQueries++;

      // Route the query appropriately
      let result: QueryResult<T>;

      if (analysis.requiresPrimary || options?.forceWrite) {
        result = await this.executeOnPrimary<T>(text, params, options);
        this.stats.writeQueries++;
      } else {
        // Check cache first for read queries
        if (options?.cached && analysis.canBeCached) {
          const cachedResult = await this.getCachedResult<T>(analysis.cacheKey || '', text, params);
          if (cachedResult) {
            this.stats.cacheHits++;
            this.stats.cachedQueries++;
            return cachedResult;
          }
          this.stats.cacheMisses++;
        }

        // Execute on replica
        result = await this.executeOnReplica<T>(text, params, options, analysis.consistencyLevel);
        this.stats.readQueries++;

        // Cache the result if applicable
        if (options?.cached && analysis.canBeCached) {
          await this.cacheResult(
            analysis.cacheKey || this.generateCacheKey(text, params),
            result,
            options.cacheTimeout
          );
        }
      }

      // Update timing stats
      const queryTime = performance.now() - startTime;
      this.updateQueryStats(queryTime, analysis.isWrite);

      return result;
    } catch (error) {
      this.stats.errors++;
      this.stats.lastError = (error as Error).message;

      if (options?.retryOnFailure) {
        return this.retryQuery<T>(text, params, options);
      }

      throw error;
    }
  }

  /**
   * Execute on primary database
   */
  private async executeOnPrimary<T extends QueryResultRow>(
    text: string,
    params?: any[],
    options?: QueryOptions
  ): Promise<QueryResult<T>> {
    const client = await this.connectionManager.getPrimaryConnection();

    try {
      if (options?.timeout) {
        await client.query(`SET statement_timeout = ${options.timeout}`);
      }

      const result = await client.query<T>(text, params);

      // Track session for read-your-writes consistency
      if (options?.sessionId) {
        this.sessionStickiness.set(options.sessionId, 'primary');

        // Clear stickiness after a delay
        setTimeout(() => {
          this.sessionStickiness.delete(options.sessionId!);
        }, 30000); // 30 seconds
      }

      return result;
    } finally {
      client.release();
    }
  }

  /**
   * Execute on replica with consistency level handling
   */
  private async executeOnReplica<T extends QueryResultRow>(
    text: string,
    params?: any[],
    options?: QueryOptions,
    consistencyLevel: ConsistencyLevel
  ): Promise<QueryResult<T>> {
    // Handle session stickiness for read-your-writes consistency
    if (options?.sessionId) {
      const stickyPool = this.sessionStickiness.get(options.sessionId);
      if (stickyPool === 'primary') {
        return this.executeOnPrimary<T>(text, params, options);
      }
    }

    // Select replica based on consistency requirements
    let client: PoolClient;

    switch (consistencyLevel) {
      case ConsistencyLevel.STRONG:
        // Use primary for strong consistency
        return this.executeOnPrimary<T>(text, params, options);

      case ConsistencyLevel.BOUNDED:
        // Use replica with acceptable lag
        client = await this.getReplicaWithAcceptableLag();
        break;

      case ConsistencyLevel.READ_YOUR_WRITES:
        // Check if session has recent writes
        if (options?.sessionId && this.sessionStickiness.has(options.sessionId)) {
          return this.executeOnPrimary<T>(text, params, options);
        }
        client = await this.connectionManager.getReplicaConnection();
        break;

      case ConsistencyLevel.EVENTUAL:
      default:
        // Use any available replica
        client = await this.connectionManager.getReplicaConnection();
    }

    try {
      if (options?.timeout) {
        await client.query(`SET statement_timeout = ${options.timeout}`);
      }

      return await client.query<T>(text, params);
    } catch (error) {
      // Fallback to primary on replica failure
      console.warn('Replica query failed, falling back to primary:', error);
      return this.executeOnPrimary<T>(text, params, options);
    } finally {
      client.release();
    }
  }

  /**
   * Get replica with acceptable replication lag
   */
  private async getReplicaWithAcceptableLag(maxLag = 1000): Promise<PoolClient> {
    if (this.replicationMonitor) {
      const healthyReplicas = this.replicationMonitor.getHealthyReplicas();
      const acceptableReplicas = healthyReplicas.filter(r => r.lagTime <= maxLag);

      if (acceptableReplicas.length > 0) {
        // Use the replica with the lowest lag
        const bestReplica = acceptableReplicas[0];
        const replicaIndex = parseInt(bestReplica.replicaName.split('-')[1]) - 1;
        return this.connectionManager.getReplicaConnection(replicaIndex);
      }
    }

    // Fallback to primary if no replicas meet the lag requirement
    return this.connectionManager.getPrimaryConnection();
  }

  /**
   * Retry a failed query with exponential backoff
   */
  private async retryQuery<T extends QueryResultRow>(
    text: string,
    params?: any[],
    options?: QueryOptions,
    attempt = 1
  ): Promise<QueryResult<T>> {
    const maxRetries = options?.maxRetries || 3;

    if (attempt > maxRetries) {
      throw new Error(`Query failed after ${maxRetries} retries`);
    }

    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Max 5 seconds
    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      // Force use of primary for retries
      return await this.executeOnPrimary<T>(text, params, options);
    } catch (error) {
      console.error(`Retry attempt ${attempt} failed:`, error);
      return this.retryQuery<T>(text, params, options, attempt + 1);
    }
  }

  /**
   * Execute a transaction
   */
  public async transaction<T>(
    callback: (client: PoolClient) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    const client = await this.connectionManager.getPrimaryConnection();

    try {
      // Set transaction options
      if (options?.isolationLevel) {
        await client.query(`SET TRANSACTION ISOLATION LEVEL ${options.isolationLevel}`);
      }
      if (options?.readOnly) {
        await client.query('SET TRANSACTION READ ONLY');
      }
      if (options?.deferrable) {
        await client.query('SET TRANSACTION DEFERRABLE');
      }

      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');

      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get or create prepared statement
   */
  public async prepare(name: string, text: string, types?: any[]): Promise<void> {
    if (this.preparedStatements.has(name)) {
      return;
    }

    const client = await this.connectionManager.getPrimaryConnection();

    try {
      const prepareQuery = types
        ? `PREPARE ${name} (${types.join(', ')}) AS ${text}`
        : `PREPARE ${name} AS ${text}`;

      await client.query(prepareQuery);
      this.preparedStatements.set(name, true);

      // Register with query analyzer
      this.queryAnalyzer.registerPreparedStatement(name, text);
    } finally {
      client.release();
    }
  }

  /**
   * Execute a prepared statement
   */
  public async execute<T extends QueryResultRow = any>(
    name: string,
    params?: any[],
    options?: QueryOptions
  ): Promise<QueryResult<T>> {
    if (!this.preparedStatements.has(name)) {
      throw new Error(`Prepared statement '${name}' not found`);
    }

    const executeQuery = `EXECUTE ${name}${params ? ` (${params.map((_, i) => `$${i + 1}`).join(', ')})` : ''}`;
    return this.query<T>(executeQuery, params, options);
  }

  /**
   * Generate cache key for a query
   */
  private generateCacheKey(text: string, params?: any[]): string {
    const hash = crypto.createHash('sha256');
    hash.update(text);
    if (params) {
      hash.update(JSON.stringify(params));
    }
    return `query:${hash.digest('hex').substring(0, 16)}`;
  }

  /**
   * Get cached query result
   */
  private async getCachedResult<T extends QueryResultRow>(
    key: string,
    text: string,
    params?: any[]
  ): Promise<QueryResult<T> | null> {
    // Check local cache first
    const localCached = this.queryCache.get(key);
    if (localCached) {
      localCached.hits++;
      return localCached.result;
    }

    // Check Redis cache if available
    if (this.redis) {
      try {
        const cached = await this.redis.get(key);
        if (cached) {
          const result = JSON.parse(cached);
          // Store in local cache for faster access
          this.queryCache.set(key, {
            result,
            timestamp: Date.now(),
            hits: 1,
          });
          return result;
        }
      } catch (error) {
        console.error('Redis cache error:', error);
      }
    }

    return null;
  }

  /**
   * Cache query result
   */
  private async cacheResult(
    key: string,
    result: QueryResult,
    timeout?: number
  ): Promise<void> {
    const cacheTimeout = timeout || this.cacheConfig.defaultTimeout!;

    // Store in local cache
    this.queryCache.set(key, {
      result,
      timestamp: Date.now(),
      hits: 0,
    });

    // Store in Redis if available
    if (this.redis) {
      try {
        const serialized = JSON.stringify(result);

        // Compress if needed
        if (serialized.length > this.cacheConfig.compressionThreshold!) {
          // In production, you'd use a compression library like zlib
          await this.redis.setex(key, Math.floor(cacheTimeout / 1000), serialized);
        } else {
          await this.redis.setex(key, Math.floor(cacheTimeout / 1000), serialized);
        }
      } catch (error) {
        console.error('Redis cache storage error:', error);
      }
    }
  }

  /**
   * Clear cache
   */
  public async clearCache(pattern?: string): Promise<void> {
    if (pattern) {
      // Clear specific pattern
      const keysToDelete: string[] = [];
      for (const key of this.queryCache.keys()) {
        if (key.includes(pattern)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => this.queryCache.delete(key));

      // Clear from Redis
      if (this.redis) {
        const keys = await this.redis.keys(`query:*${pattern}*`);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      }
    } else {
      // Clear all cache
      this.queryCache.clear();

      if (this.redis) {
        const keys = await this.redis.keys('query:*');
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      }
    }
  }

  /**
   * Update query statistics
   */
  private updateQueryStats(queryTime: number, isWrite: boolean): void {
    const currentAvg = this.stats.averageQueryTime;
    const totalQueries = this.stats.totalQueries;

    this.stats.averageQueryTime =
      (currentAvg * (totalQueries - 1) + queryTime) / totalQueries;

    if (isWrite) {
      const currentWriteAvg = this.stats.averageWriteTime;
      const totalWrites = this.stats.writeQueries;
      this.stats.averageWriteTime =
        (currentWriteAvg * (totalWrites - 1) + queryTime) / totalWrites;
    } else {
      const currentReadAvg = this.stats.averageReadTime;
      const totalReads = this.stats.readQueries;
      this.stats.averageReadTime =
        (currentReadAvg * (totalReads - 1) + queryTime) / totalReads;
    }
  }

  /**
   * Get database statistics
   */
  public getStats(): DatabaseStats {
    const stats = { ...this.stats };

    // Add connection pool stats
    stats.connectionPoolStats = this.connectionManager.getStats();

    // Add replication lag stats
    if (this.replicationMonitor) {
      const replicationStatus = this.replicationMonitor.getStatus();
      for (const [name, status] of replicationStatus) {
        stats.replicationLag.set(name, status.lagTime);
      }
    }

    return stats;
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<{
    healthy: boolean;
    primary: boolean;
    replicas: { name: string; healthy: boolean; lag?: number }[];
  }> {
    const result = {
      healthy: false,
      primary: false,
      replicas: [] as { name: string; healthy: boolean; lag?: number }[],
    };

    // Check primary
    result.primary = this.connectionManager.isPoolHealthy('primary');

    // Check replicas
    if (this.replicationMonitor) {
      const status = this.replicationMonitor.getStatus();
      for (const [name, replicaStatus] of status) {
        result.replicas.push({
          name,
          healthy: replicaStatus.isHealthy,
          lag: replicaStatus.lagTime,
        });
      }
    }

    result.healthy = result.primary && result.replicas.some(r => r.healthy);

    return result;
  }

  /**
   * Gracefully shutdown the pool
   */
  public async shutdown(): Promise<void> {
    console.log('Shutting down read replica pool...');
    this.isShuttingDown = true;

    // Stop replication monitoring
    if (this.replicationMonitor) {
      this.replicationMonitor.stop();
    }

    // Clear cache
    await this.clearCache();

    // Close Redis connection
    if (this.redis) {
      await this.redis.quit();
    }

    // Shutdown connection manager
    await this.connectionManager.shutdown();

    console.log('Read replica pool shut down successfully');
  }
}

// Create singleton instance
let instance: ReadReplicaPool | null = null;

export function getReadReplicaPool(reinitialize = false): ReadReplicaPool {
  if (!instance || reinitialize) {
    // Initialize Redis if configured
    let redis: Redis | undefined;
    if (process.env.REDIS_ENABLED === 'true') {
      redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0'),
      });
    }

    instance = new ReadReplicaPool(undefined, {
      enabled: process.env.CACHE_ENABLED !== 'false',
      redis,
      defaultTimeout: parseInt(process.env.CACHE_TIMEOUT || '300000'),
      maxCacheSize: parseInt(process.env.CACHE_MAX_SIZE || '1000'),
    });
  }

  return instance;
}

// Export for backward compatibility
export const db = getReadReplicaPool();