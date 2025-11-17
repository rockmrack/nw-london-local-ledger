import { Pool, PoolClient, QueryResult } from 'pg';
import Redis from 'ioredis';
import crypto from 'crypto';
import { performance } from 'perf_hooks';

// Database connection pools
interface DatabasePools {
  primary: Pool;
  replicas: Pool[];
  redis: Redis;
  stats: {
    readQueries: number;
    writeQueries: number;
    cacheHits: number;
    cacheMisses: number;
    avgQueryTime: number;
  };
}

// Advanced database manager with read/write splitting
export class DatabaseManager {
  private pools: DatabasePools;
  private currentReplicaIndex = 0;
  private preparedStatements = new Map<string, string>();
  private queryCache = new Map<string, { result: any; timestamp: number }>();
  private cacheTimeout = 300000; // 5 minutes

  constructor() {
    this.initializePools();
    this.setupHealthChecks();
    this.setupPreparedStatements();
  }

  private initializePools() {
    // Primary write pool with connection pooling
    const primaryConfig = {
      host: process.env.DB_PRIMARY_HOST || 'localhost',
      port: parseInt(process.env.DB_PRIMARY_PORT || '5432'),
      database: process.env.DB_NAME || 'nw_london_local',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      max: 50, // Maximum connections
      min: 10, // Minimum connections
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      statement_timeout: 30000,
      query_timeout: 30000,
      application_name: 'nw-london-primary',
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    };

    // Read replica pools with automatic failover
    const replicaConfigs = [
      {
        host: process.env.DB_REPLICA1_HOST || 'localhost',
        port: parseInt(process.env.DB_REPLICA1_PORT || '5433'),
        max: 100, // More connections for read-heavy workload
        min: 20,
        application_name: 'nw-london-replica1',
      },
      {
        host: process.env.DB_REPLICA2_HOST || 'localhost',
        port: parseInt(process.env.DB_REPLICA2_PORT || '5434'),
        max: 100,
        min: 20,
        application_name: 'nw-london-replica2',
      },
    ];

    this.pools = {
      primary: new Pool(primaryConfig),
      replicas: replicaConfigs.map((config) =>
        new Pool({ ...primaryConfig, ...config })
      ),
      redis: new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: 0,
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => Math.min(times * 50, 2000),
        enableReadyCheck: true,
        lazyConnect: false,
      }),
      stats: {
        readQueries: 0,
        writeQueries: 0,
        cacheHits: 0,
        cacheMisses: 0,
        avgQueryTime: 0,
      },
    };

    // Setup event listeners
    this.pools.primary.on('error', (err) => {
      console.error('Primary database pool error:', err);
      this.handlePrimaryFailure();
    });

    this.pools.replicas.forEach((pool, index) => {
      pool.on('error', (err) => {
        console.error(`Replica ${index + 1} pool error:`, err);
        this.handleReplicaFailure(index);
      });
    });
  }

  // Prepared statements for frequently used queries
  private setupPreparedStatements() {
    this.preparedStatements.set(
      'getPropertyById',
      'PREPARE get_property_by_id AS SELECT * FROM properties WHERE id = $1'
    );
    this.preparedStatements.set(
      'searchProperties',
      `PREPARE search_properties AS
       SELECT p.*, c.name as council_name
       FROM properties p
       JOIN councils c ON p.council_id = c.id
       WHERE p.search_vector @@ plainto_tsquery($1)
       ORDER BY ts_rank(p.search_vector, plainto_tsquery($1)) DESC
       LIMIT $2 OFFSET $3`
    );
    this.preparedStatements.set(
      'getPropertiesByCouncil',
      'PREPARE get_properties_by_council AS SELECT * FROM properties WHERE council_id = $1 LIMIT $2 OFFSET $3'
    );
    this.preparedStatements.set(
      'updatePropertyViews',
      'PREPARE update_property_views AS UPDATE properties SET views = views + 1 WHERE id = $1'
    );
  }

  // Intelligent read/write query splitting
  public async query(
    text: string,
    params?: any[],
    options?: {
      forceWrite?: boolean;
      cached?: boolean;
      cacheKey?: string;
      timeout?: number;
    }
  ): Promise<QueryResult> {
    const startTime = performance.now();

    try {
      // Determine if query is read or write
      const isWriteQuery = this.isWriteQuery(text) || options?.forceWrite;

      if (isWriteQuery) {
        this.pools.stats.writeQueries++;
        return await this.executeWrite(text, params, options?.timeout);
      } else {
        this.pools.stats.readQueries++;

        // Check cache for read queries
        if (options?.cached) {
          const cacheKey = options.cacheKey || this.generateCacheKey(text, params);
          const cachedResult = await this.getCachedResult(cacheKey);

          if (cachedResult) {
            this.pools.stats.cacheHits++;
            return cachedResult;
          }

          this.pools.stats.cacheMisses++;
          const result = await this.executeRead(text, params, options?.timeout);
          await this.cacheResult(cacheKey, result);
          return result;
        }

        return await this.executeRead(text, params, options?.timeout);
      }
    } finally {
      const queryTime = performance.now() - startTime;
      this.updateAverageQueryTime(queryTime);
    }
  }

  // Execute write queries on primary
  private async executeWrite(
    text: string,
    params?: any[],
    timeout = 30000
  ): Promise<QueryResult> {
    const client = await this.pools.primary.connect();

    try {
      // Set statement timeout
      await client.query(`SET statement_timeout = ${timeout}`);

      // Use prepared statement if available
      const preparedName = this.findPreparedStatement(text);
      if (preparedName) {
        return await client.query(`EXECUTE ${preparedName}`, params);
      }

      return await client.query(text, params);
    } finally {
      client.release();
    }
  }

  // Execute read queries on replicas with load balancing
  private async executeRead(
    text: string,
    params?: any[],
    timeout = 10000
  ): Promise<QueryResult> {
    const replica = this.getNextReplica();

    if (!replica) {
      // Fallback to primary if no replicas available
      return this.executeWrite(text, params, timeout);
    }

    const client = await replica.connect();

    try {
      // Set statement timeout
      await client.query(`SET statement_timeout = ${timeout}`);

      // Use prepared statement if available
      const preparedName = this.findPreparedStatement(text);
      if (preparedName) {
        return await client.query(`EXECUTE ${preparedName}`, params);
      }

      return await client.query(text, params);
    } catch (error) {
      // Retry on primary if replica fails
      console.error('Replica query failed, retrying on primary:', error);
      return this.executeWrite(text, params, timeout);
    } finally {
      client.release();
    }
  }

  // Round-robin load balancing for read replicas
  private getNextReplica(): Pool | null {
    const availableReplicas = this.pools.replicas.filter(
      (pool) => pool.totalCount < pool.options.max
    );

    if (availableReplicas.length === 0) {
      return null;
    }

    const replica = availableReplicas[this.currentReplicaIndex % availableReplicas.length];
    this.currentReplicaIndex++;
    return replica;
  }

  // Determine if query is a write operation
  private isWriteQuery(text: string): boolean {
    const writePatterns = [
      /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|COPY)/i,
      /^\s*WITH\s+.*\s+(INSERT|UPDATE|DELETE)/i,
      /FOR\s+UPDATE/i,
      /RETURNING/i,
    ];

    return writePatterns.some((pattern) => pattern.test(text));
  }

  // Generate cache key for queries
  private generateCacheKey(text: string, params?: any[]): string {
    const hash = crypto.createHash('sha256');
    hash.update(text);
    if (params) {
      hash.update(JSON.stringify(params));
    }
    return `query:${hash.digest('hex')}`;
  }

  // Get cached query result
  private async getCachedResult(key: string): Promise<QueryResult | null> {
    try {
      const cached = await this.pools.redis.get(key);
      if (cached) {
        const parsed = JSON.parse(cached);

        // Check if cache is still valid
        if (Date.now() - parsed.timestamp < this.cacheTimeout) {
          return parsed.result;
        }

        // Remove expired cache
        await this.pools.redis.del(key);
      }
    } catch (error) {
      console.error('Cache retrieval error:', error);
    }

    return null;
  }

  // Cache query result
  private async cacheResult(key: string, result: QueryResult): Promise<void> {
    try {
      const cacheData = {
        result,
        timestamp: Date.now(),
      };

      await this.pools.redis.setex(
        key,
        Math.floor(this.cacheTimeout / 1000),
        JSON.stringify(cacheData)
      );
    } catch (error) {
      console.error('Cache storage error:', error);
    }
  }

  // Find prepared statement by query text
  private findPreparedStatement(text: string): string | null {
    for (const [name, statement] of this.preparedStatements) {
      if (text.includes(name) || text.includes(statement)) {
        return name;
      }
    }
    return null;
  }

  // Health check for database connections
  private setupHealthChecks() {
    setInterval(async () => {
      // Check primary
      try {
        await this.pools.primary.query('SELECT 1');
      } catch (error) {
        console.error('Primary health check failed:', error);
        this.handlePrimaryFailure();
      }

      // Check replicas
      for (let i = 0; i < this.pools.replicas.length; i++) {
        try {
          await this.pools.replicas[i].query('SELECT 1');
        } catch (error) {
          console.error(`Replica ${i + 1} health check failed:`, error);
          this.handleReplicaFailure(i);
        }
      }

      // Check Redis
      try {
        await this.pools.redis.ping();
      } catch (error) {
        console.error('Redis health check failed:', error);
        this.handleRedisFailure();
      }
    }, 30000); // Every 30 seconds
  }

  // Handle primary database failure
  private async handlePrimaryFailure() {
    console.error('Primary database failure detected');

    // Promote first healthy replica to primary
    for (const replica of this.pools.replicas) {
      try {
        await replica.query('SELECT 1');
        console.log('Promoting replica to primary');
        this.pools.primary = replica;
        break;
      } catch (error) {
        continue;
      }
    }

    // Alert monitoring system
    this.sendAlert('PRIMARY_DB_FAILURE', 'Primary database connection failed');
  }

  // Handle replica failure
  private async handleReplicaFailure(index: number) {
    console.error(`Replica ${index + 1} failure detected`);

    // Remove failed replica from pool
    this.pools.replicas.splice(index, 1);

    // Alert monitoring system
    this.sendAlert('REPLICA_DB_FAILURE', `Replica ${index + 1} connection failed`);
  }

  // Handle Redis failure
  private async handleRedisFailure() {
    console.error('Redis cache failure detected');

    // Try to reconnect
    try {
      await this.pools.redis.connect();
    } catch (error) {
      // Disable caching temporarily
      console.error('Redis reconnection failed, disabling cache');
    }

    // Alert monitoring system
    this.sendAlert('REDIS_FAILURE', 'Redis cache connection failed');
  }

  // Send alert to monitoring system
  private sendAlert(type: string, message: string) {
    // Implementation would send to monitoring service
    console.error(`ALERT [${type}]: ${message}`);
  }

  // Update average query time
  private updateAverageQueryTime(queryTime: number) {
    const totalQueries = this.pools.stats.readQueries + this.pools.stats.writeQueries;
    const currentAvg = this.pools.stats.avgQueryTime;

    this.pools.stats.avgQueryTime =
      (currentAvg * (totalQueries - 1) + queryTime) / totalQueries;
  }

  // Get pool statistics
  public getStats() {
    return {
      ...this.pools.stats,
      primaryConnections: this.pools.primary.totalCount,
      replicaConnections: this.pools.replicas.reduce(
        (sum, pool) => sum + pool.totalCount,
        0
      ),
      cacheSize: this.queryCache.size,
    };
  }

  // Clean up connections
  public async close() {
    await this.pools.primary.end();
    await Promise.all(this.pools.replicas.map((pool) => pool.end()));
    await this.pools.redis.quit();
  }
}

// Export singleton instance
export const db = new DatabaseManager();