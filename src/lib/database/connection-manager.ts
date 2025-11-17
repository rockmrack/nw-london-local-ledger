/**
 * Connection Manager
 * Advanced connection pool management with health checks and automatic failover
 */

import { Pool, PoolClient, PoolConfig, QueryResult } from 'pg';
import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';

export interface ConnectionStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  totalQueries: number;
  averageQueryTime: number;
  errors: number;
  lastError?: string;
  lastHealthCheck?: Date;
  isHealthy: boolean;
  replicationLag?: number;
}

export interface PoolManagerConfig {
  primary: PoolConfig;
  replicas: PoolConfig[];
  pgBouncerConfig?: {
    enabled: boolean;
    host?: string;
    port?: number;
    poolMode?: 'session' | 'transaction' | 'statement';
    maxClientConn?: number;
    defaultPoolSize?: number;
  };
  healthCheckInterval?: number;
  connectionRetryAttempts?: number;
  connectionRetryDelay?: number;
}

export class ConnectionManager extends EventEmitter {
  private primaryPool: Pool;
  private replicaPools: Pool[] = [];
  private poolStats: Map<string, ConnectionStats> = new Map();
  private healthCheckTimer?: NodeJS.Timeout;
  private currentReplicaIndex = 0;
  private config: PoolManagerConfig;
  private isShuttingDown = false;
  private pgBouncerPools?: { primary: Pool; replicas: Pool[] };

  constructor(config: PoolManagerConfig) {
    super();
    this.config = config;
    this.initializePools();
  }

  private initializePools(): void {
    // Initialize primary pool
    const primaryConfig: PoolConfig = {
      ...this.config.primary,
      max: this.config.primary.max || 100,
      min: this.config.primary.min || 10,
      idleTimeoutMillis: this.config.primary.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: this.config.primary.connectionTimeoutMillis || 5000,
      statement_timeout: this.config.primary.statement_timeout || 30000,
      application_name: this.config.primary.application_name || 'nw-london-primary',
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    };

    this.primaryPool = new Pool(primaryConfig);
    this.setupPoolEventHandlers(this.primaryPool, 'primary');
    this.initializePoolStats('primary');

    // Initialize replica pools
    this.replicaPools = this.config.replicas.map((replicaConfig, index) => {
      const config: PoolConfig = {
        ...replicaConfig,
        max: replicaConfig.max || 150,
        min: replicaConfig.min || 20,
        idleTimeoutMillis: replicaConfig.idleTimeoutMillis || 30000,
        connectionTimeoutMillis: replicaConfig.connectionTimeoutMillis || 5000,
        statement_timeout: replicaConfig.statement_timeout || 10000,
        application_name: replicaConfig.application_name || `nw-london-replica-${index + 1}`,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
      };

      const pool = new Pool(config);
      this.setupPoolEventHandlers(pool, `replica-${index + 1}`);
      this.initializePoolStats(`replica-${index + 1}`);

      return pool;
    });

    // Initialize PgBouncer pools if configured
    if (this.config.pgBouncerConfig?.enabled) {
      this.initializePgBouncerPools();
    }

    // Start health checks
    this.startHealthChecks();
  }

  private initializePgBouncerPools(): void {
    const pgBouncerHost = this.config.pgBouncerConfig?.host || 'localhost';
    const pgBouncerPort = this.config.pgBouncerConfig?.port || 6432;

    // Create PgBouncer connection for primary
    const pgBouncerPrimaryConfig: PoolConfig = {
      host: pgBouncerHost,
      port: pgBouncerPort,
      database: this.config.primary.database,
      user: this.config.primary.user,
      password: this.config.primary.password,
      max: this.config.pgBouncerConfig?.maxClientConn || 1000,
      min: 10,
      application_name: 'nw-london-pgbouncer-primary',
    };

    // Create PgBouncer connections for replicas
    const pgBouncerReplicaConfigs = this.config.replicas.map((_, index) => ({
      host: pgBouncerHost,
      port: pgBouncerPort + index + 1, // Different ports for each replica
      database: this.config.primary.database,
      user: this.config.primary.user,
      password: this.config.primary.password,
      max: this.config.pgBouncerConfig?.maxClientConn || 1000,
      min: 10,
      application_name: `nw-london-pgbouncer-replica-${index + 1}`,
    }));

    this.pgBouncerPools = {
      primary: new Pool(pgBouncerPrimaryConfig),
      replicas: pgBouncerReplicaConfigs.map(config => new Pool(config)),
    };

    console.log('PgBouncer connection pools initialized');
  }

  private setupPoolEventHandlers(pool: Pool, name: string): void {
    pool.on('connect', (client) => {
      const stats = this.poolStats.get(name);
      if (stats) {
        stats.totalConnections++;
        stats.activeConnections++;
      }
      this.emit('connection', { pool: name, event: 'connect' });
    });

    pool.on('acquire', (client) => {
      const stats = this.poolStats.get(name);
      if (stats) {
        stats.activeConnections++;
        stats.idleConnections = Math.max(0, stats.idleConnections - 1);
      }
    });

    pool.on('release', (client) => {
      const stats = this.poolStats.get(name);
      if (stats) {
        stats.activeConnections = Math.max(0, stats.activeConnections - 1);
        stats.idleConnections++;
      }
    });

    pool.on('remove', (client) => {
      const stats = this.poolStats.get(name);
      if (stats) {
        stats.totalConnections = Math.max(0, stats.totalConnections - 1);
        stats.activeConnections = Math.max(0, stats.activeConnections - 1);
      }
    });

    pool.on('error', (err, client) => {
      const stats = this.poolStats.get(name);
      if (stats) {
        stats.errors++;
        stats.lastError = err.message;
        stats.isHealthy = false;
      }

      console.error(`Pool ${name} error:`, err);
      this.emit('error', { pool: name, error: err });

      // Attempt to recover
      this.handlePoolError(name, pool);
    });
  }

  private initializePoolStats(name: string): void {
    this.poolStats.set(name, {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      waitingRequests: 0,
      totalQueries: 0,
      averageQueryTime: 0,
      errors: 0,
      isHealthy: true,
    });
  }

  private async handlePoolError(name: string, pool: Pool): Promise<void> {
    console.log(`Attempting to recover pool: ${name}`);

    const retryAttempts = this.config.connectionRetryAttempts || 3;
    const retryDelay = this.config.connectionRetryDelay || 5000;

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));

        // Test connection
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();

        console.log(`Pool ${name} recovered successfully`);
        const stats = this.poolStats.get(name);
        if (stats) {
          stats.isHealthy = true;
        }

        this.emit('recovery', { pool: name, attempt });
        return;
      } catch (error) {
        console.error(`Recovery attempt ${attempt} failed for pool ${name}:`, error);
      }
    }

    // If all recovery attempts fail, mark as permanently unhealthy
    console.error(`Pool ${name} could not be recovered after ${retryAttempts} attempts`);
    this.emit('failure', { pool: name });

    // If primary fails and cannot recover, promote a replica
    if (name === 'primary') {
      await this.promoteReplicaToPrimary();
    }
  }

  private async promoteReplicaToPrimary(): Promise<void> {
    console.log('Attempting to promote a replica to primary...');

    for (let i = 0; i < this.replicaPools.length; i++) {
      const replica = this.replicaPools[i];
      const replicaName = `replica-${i + 1}`;
      const stats = this.poolStats.get(replicaName);

      if (stats?.isHealthy) {
        try {
          // Test the replica
          const client = await replica.connect();
          await client.query('SELECT 1');
          client.release();

          // Promote this replica to primary
          console.log(`Promoting ${replicaName} to primary`);
          this.primaryPool = replica;
          this.replicaPools.splice(i, 1);

          // Update stats
          this.poolStats.set('primary', stats);
          this.poolStats.delete(replicaName);

          this.emit('promotion', { replica: replicaName });
          return;
        } catch (error) {
          console.error(`Failed to promote ${replicaName}:`, error);
        }
      }
    }

    console.error('CRITICAL: No healthy replicas available for promotion');
    this.emit('critical', { message: 'No healthy database connections available' });
  }

  private startHealthChecks(): void {
    const interval = this.config.healthCheckInterval || 30000;

    this.healthCheckTimer = setInterval(async () => {
      if (this.isShuttingDown) return;

      // Check primary
      await this.checkPoolHealth(this.primaryPool, 'primary');

      // Check replicas
      for (let i = 0; i < this.replicaPools.length; i++) {
        await this.checkPoolHealth(this.replicaPools[i], `replica-${i + 1}`);
        await this.checkReplicationLag(this.replicaPools[i], `replica-${i + 1}`);
      }

      // Check PgBouncer pools if enabled
      if (this.pgBouncerPools) {
        await this.checkPoolHealth(this.pgBouncerPools.primary, 'pgbouncer-primary');
        for (let i = 0; i < this.pgBouncerPools.replicas.length; i++) {
          await this.checkPoolHealth(this.pgBouncerPools.replicas[i], `pgbouncer-replica-${i + 1}`);
        }
      }
    }, interval);
  }

  private async checkPoolHealth(pool: Pool, name: string): Promise<void> {
    const stats = this.poolStats.get(name);
    if (!stats) return;

    try {
      const client = await pool.connect();
      const start = performance.now();
      await client.query('SELECT 1');
      const queryTime = performance.now() - start;

      client.release();

      stats.isHealthy = true;
      stats.lastHealthCheck = new Date();

      // Update average query time
      stats.totalQueries++;
      stats.averageQueryTime =
        (stats.averageQueryTime * (stats.totalQueries - 1) + queryTime) / stats.totalQueries;

      // Update connection counts
      stats.totalConnections = pool.totalCount;
      stats.idleConnections = pool.idleCount;
      stats.waitingRequests = pool.waitingCount;
    } catch (error) {
      stats.isHealthy = false;
      stats.errors++;
      stats.lastError = (error as Error).message;

      console.error(`Health check failed for ${name}:`, error);
      this.emit('unhealthy', { pool: name, error });

      // Attempt recovery
      await this.handlePoolError(name, pool);
    }
  }

  private async checkReplicationLag(pool: Pool, name: string): Promise<void> {
    const stats = this.poolStats.get(name);
    if (!stats || !stats.isHealthy) return;

    try {
      const client = await pool.connect();

      // Query to check replication lag
      const result = await client.query(`
        SELECT
          EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp())) AS replication_lag_seconds
      `);

      client.release();

      const lagSeconds = result.rows[0]?.replication_lag_seconds;
      if (lagSeconds !== null) {
        stats.replicationLag = lagSeconds * 1000; // Convert to milliseconds

        // Emit warning if lag is too high
        if (stats.replicationLag > 1000) {
          // 1 second
          this.emit('high-lag', { pool: name, lag: stats.replicationLag });
        }
      }
    } catch (error) {
      // Some databases might not have replication set up
      // This is not necessarily an error condition
    }
  }

  /**
   * Get a connection from the primary pool
   */
  public async getPrimaryConnection(): Promise<PoolClient> {
    const stats = this.poolStats.get('primary');
    if (!stats?.isHealthy) {
      throw new Error('Primary database connection is not healthy');
    }

    return this.primaryPool.connect();
  }

  /**
   * Get a connection from a replica pool using round-robin
   */
  public async getReplicaConnection(preferredIndex?: number): Promise<PoolClient> {
    // If a specific replica is requested and healthy, use it
    if (preferredIndex !== undefined && preferredIndex < this.replicaPools.length) {
      const stats = this.poolStats.get(`replica-${preferredIndex + 1}`);
      if (stats?.isHealthy) {
        return this.replicaPools[preferredIndex].connect();
      }
    }

    // Find all healthy replicas
    const healthyReplicas: { pool: Pool; index: number }[] = [];
    for (let i = 0; i < this.replicaPools.length; i++) {
      const stats = this.poolStats.get(`replica-${i + 1}`);
      if (stats?.isHealthy) {
        healthyReplicas.push({ pool: this.replicaPools[i], index: i });
      }
    }

    // If no healthy replicas, fall back to primary
    if (healthyReplicas.length === 0) {
      console.warn('No healthy replicas available, falling back to primary');
      return this.getPrimaryConnection();
    }

    // Round-robin selection among healthy replicas
    const selected = healthyReplicas[this.currentReplicaIndex % healthyReplicas.length];
    this.currentReplicaIndex++;

    // Select replica with lowest replication lag if available
    if (healthyReplicas.length > 1) {
      const replicaWithLowestLag = healthyReplicas.reduce((prev, curr) => {
        const prevStats = this.poolStats.get(`replica-${prev.index + 1}`);
        const currStats = this.poolStats.get(`replica-${curr.index + 1}`);

        const prevLag = prevStats?.replicationLag || 0;
        const currLag = currStats?.replicationLag || 0;

        return currLag < prevLag ? curr : prev;
      });

      return replicaWithLowestLag.pool.connect();
    }

    return selected.pool.connect();
  }

  /**
   * Get connection from PgBouncer pool
   */
  public async getPgBouncerConnection(isPrimary: boolean): Promise<PoolClient | null> {
    if (!this.pgBouncerPools) return null;

    if (isPrimary) {
      return this.pgBouncerPools.primary.connect();
    }

    const replicaIndex = this.currentReplicaIndex % this.pgBouncerPools.replicas.length;
    this.currentReplicaIndex++;
    return this.pgBouncerPools.replicas[replicaIndex].connect();
  }

  /**
   * Execute a query with automatic connection management
   */
  public async query(
    sql: string,
    params?: any[],
    usePrimary = false
  ): Promise<QueryResult> {
    const client = usePrimary
      ? await this.getPrimaryConnection()
      : await this.getReplicaConnection();

    try {
      const start = performance.now();
      const result = await client.query(sql, params);
      const queryTime = performance.now() - start;

      // Update stats
      const poolName = usePrimary ? 'primary' : `replica-${this.currentReplicaIndex}`;
      const stats = this.poolStats.get(poolName);
      if (stats) {
        stats.totalQueries++;
        stats.averageQueryTime =
          (stats.averageQueryTime * (stats.totalQueries - 1) + queryTime) / stats.totalQueries;
      }

      return result;
    } finally {
      client.release();
    }
  }

  /**
   * Get all pool statistics
   */
  public getStats(): Map<string, ConnectionStats> {
    return new Map(this.poolStats);
  }

  /**
   * Get stats for a specific pool
   */
  public getPoolStats(name: string): ConnectionStats | undefined {
    return this.poolStats.get(name);
  }

  /**
   * Check if a pool is healthy
   */
  public isPoolHealthy(name: string): boolean {
    return this.poolStats.get(name)?.isHealthy || false;
  }

  /**
   * Get the total number of connections across all pools
   */
  public getTotalConnections(): number {
    let total = 0;
    for (const stats of this.poolStats.values()) {
      total += stats.totalConnections;
    }
    return total;
  }

  /**
   * Gracefully shutdown all connections
   */
  public async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    console.log('Shutting down connection pools...');

    const shutdownPromises: Promise<void>[] = [];

    // Shutdown primary
    shutdownPromises.push(this.primaryPool.end());

    // Shutdown replicas
    for (const replica of this.replicaPools) {
      shutdownPromises.push(replica.end());
    }

    // Shutdown PgBouncer pools if present
    if (this.pgBouncerPools) {
      shutdownPromises.push(this.pgBouncerPools.primary.end());
      for (const replica of this.pgBouncerPools.replicas) {
        shutdownPromises.push(replica.end());
      }
    }

    await Promise.all(shutdownPromises);
    console.log('All connection pools shut down successfully');
  }
}

// Export helper function to create connection manager from environment variables
export function createConnectionManagerFromEnv(): ConnectionManager {
  const config: PoolManagerConfig = {
    primary: {
      host: process.env.DB_PRIMARY_HOST || 'localhost',
      port: parseInt(process.env.DB_PRIMARY_PORT || '5432'),
      database: process.env.DB_NAME || 'nw_london_local',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      max: parseInt(process.env.DB_PRIMARY_MAX_CONNECTIONS || '100'),
      min: parseInt(process.env.DB_PRIMARY_MIN_CONNECTIONS || '10'),
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    },
    replicas: [],
    pgBouncerConfig: {
      enabled: process.env.PGBOUNCER_ENABLED === 'true',
      host: process.env.PGBOUNCER_HOST,
      port: process.env.PGBOUNCER_PORT ? parseInt(process.env.PGBOUNCER_PORT) : undefined,
      poolMode: (process.env.PGBOUNCER_POOL_MODE as any) || 'transaction',
      maxClientConn: process.env.PGBOUNCER_MAX_CLIENT_CONN
        ? parseInt(process.env.PGBOUNCER_MAX_CLIENT_CONN)
        : 1000,
      defaultPoolSize: process.env.PGBOUNCER_DEFAULT_POOL_SIZE
        ? parseInt(process.env.PGBOUNCER_DEFAULT_POOL_SIZE)
        : 25,
    },
    healthCheckInterval: parseInt(process.env.DB_HEALTH_CHECK_INTERVAL || '30000'),
    connectionRetryAttempts: parseInt(process.env.DB_RETRY_ATTEMPTS || '3'),
    connectionRetryDelay: parseInt(process.env.DB_RETRY_DELAY || '5000'),
  };

  // Add replicas from environment variables
  for (let i = 1; i <= 3; i++) {
    const host = process.env[`DB_REPLICA${i}_HOST`];
    if (host) {
      config.replicas.push({
        host,
        port: parseInt(process.env[`DB_REPLICA${i}_PORT`] || '5432'),
        database: process.env.DB_NAME || 'nw_london_local',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        max: parseInt(process.env[`DB_REPLICA${i}_MAX_CONNECTIONS`] || '150'),
        min: parseInt(process.env[`DB_REPLICA${i}_MIN_CONNECTIONS`] || '20'),
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
      });
    }
  }

  return new ConnectionManager(config);
}