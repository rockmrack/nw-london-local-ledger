/**
 * Database monitoring hooks and utilities
 */

import { monitoringService } from './monitoring-service';
import { Pool, PoolClient, QueryResult } from 'pg';

interface QueryInfo {
  query: string;
  params?: any[];
  startTime: number;
  client?: string;
}

interface ConnectionInfo {
  id: string;
  createdAt: number;
  lastUsed: number;
  queryCount: number;
}

export class DatabaseMonitor {
  private activeQueries: Map<string, QueryInfo> = new Map();
  private connections: Map<string, ConnectionInfo> = new Map();
  private queryHistory: any[] = [];
  private n1DetectionCache: Map<string, number> = new Map();

  /**
   * Wrap a database pool with monitoring
   */
  wrapPool(pool: Pool): Pool {
    const originalQuery = pool.query.bind(pool);
    const originalConnect = pool.connect.bind(pool);

    // Monitor query execution
    pool.query = (async (...args: any[]): Promise<QueryResult> => {
      const queryId = this.generateQueryId();
      const startTime = Date.now();

      let queryText: string;
      let queryParams: any[] | undefined;

      // Handle different query formats
      if (typeof args[0] === 'string') {
        queryText = args[0];
        queryParams = args[1];
      } else if (args[0] && typeof args[0] === 'object') {
        queryText = args[0].text || args[0].name || 'unknown';
        queryParams = args[0].values;
      } else {
        queryText = 'unknown_query';
      }

      // Start tracking
      this.activeQueries.set(queryId, {
        query: queryText,
        params: queryParams,
        startTime
      });

      // Check for N+1 queries
      this.checkN1Query(queryText);

      try {
        const result = await originalQuery(...args);
        const duration = Date.now() - startTime;

        // Record successful query
        this.recordQueryMetrics(queryText, duration, {
          rows: result.rowCount,
          success: true,
          params: queryParams?.length
        });

        // Store in history
        this.addToHistory({
          queryId,
          query: queryText,
          duration,
          rowCount: result.rowCount,
          timestamp: Date.now()
        });

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;

        // Record failed query
        this.recordQueryMetrics(queryText, duration, {
          success: false,
          error: (error as Error).message,
          params: queryParams?.length
        });

        throw error;
      } finally {
        this.activeQueries.delete(queryId);
      }
    }) as any;

    // Monitor connection pool
    pool.connect = (async (...args: any[]): Promise<PoolClient> => {
      const client = await originalConnect(...args);
      const clientId = this.generateClientId();

      // Track connection
      this.connections.set(clientId, {
        id: clientId,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        queryCount: 0
      });

      // Wrap client query method
      const originalClientQuery = client.query.bind(client);
      client.query = (async (...queryArgs: any[]): Promise<QueryResult> => {
        const connection = this.connections.get(clientId);
        if (connection) {
          connection.lastUsed = Date.now();
          connection.queryCount++;
        }

        return this.monitorClientQuery(originalClientQuery, clientId, queryArgs);
      }) as any;

      // Wrap release method
      const originalRelease = client.release.bind(client);
      client.release = ((error?: Error | boolean) => {
        this.connections.delete(clientId);
        return originalRelease(error);
      }) as any;

      // Update pool metrics
      this.updatePoolMetrics(pool);

      return client;
    }) as any;

    return pool;
  }

  /**
   * Monitor client query execution
   */
  private async monitorClientQuery(
    originalQuery: Function,
    clientId: string,
    args: any[]
  ): Promise<QueryResult> {
    const queryId = this.generateQueryId();
    const startTime = Date.now();

    let queryText: string;
    if (typeof args[0] === 'string') {
      queryText = args[0];
    } else if (args[0] && typeof args[0] === 'object') {
      queryText = args[0].text || args[0].name || 'unknown';
    } else {
      queryText = 'unknown_query';
    }

    this.activeQueries.set(queryId, {
      query: queryText,
      startTime,
      client: clientId
    });

    try {
      const result = await originalQuery(...args);
      const duration = Date.now() - startTime;

      this.recordQueryMetrics(queryText, duration, {
        rows: result.rowCount,
        success: true,
        client: clientId
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.recordQueryMetrics(queryText, duration, {
        success: false,
        error: (error as Error).message,
        client: clientId
      });

      throw error;
    } finally {
      this.activeQueries.delete(queryId);
    }
  }

  /**
   * Check for N+1 query problems
   */
  private checkN1Query(query: string): void {
    // Normalize query for comparison
    const normalizedQuery = this.normalizeQuery(query);

    // Get count of similar queries in last 5 seconds
    const cacheKey = `n1_${normalizedQuery}`;
    const currentCount = this.n1DetectionCache.get(cacheKey) || 0;

    this.n1DetectionCache.set(cacheKey, currentCount + 1);

    // Clear cache entry after 5 seconds
    setTimeout(() => {
      this.n1DetectionCache.delete(cacheKey);
    }, 5000);

    // Alert if we see the same query pattern multiple times
    if (currentCount > 10) {
      console.warn('[N+1 DETECTED]', {
        query: normalizedQuery.substring(0, 100),
        count: currentCount,
        message: 'Consider using a JOIN or batch query instead'
      });

      monitoringService.recordError(new Error('N+1 Query Pattern Detected'), {
        query: normalizedQuery,
        count: currentCount
      });
    }
  }

  /**
   * Normalize query for N+1 detection
   */
  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/\$\d+/g, '$?') // Replace parameter placeholders
      .replace(/\d+/g, '?')     // Replace numbers
      .replace(/'[^']*'/g, '?') // Replace string literals
      .trim();
  }

  /**
   * Record query metrics
   */
  private recordQueryMetrics(
    query: string,
    duration: number,
    metadata: Record<string, any>
  ): void {
    monitoringService.recordQuery(query, duration, metadata);

    // Log slow queries
    if (duration > 100) {
      console.warn('[SLOW QUERY]', {
        query: query.substring(0, 200),
        duration: `${duration}ms`,
        ...metadata
      });
    }

    // Log very slow queries as errors
    if (duration > 1000) {
      monitoringService.recordError(new Error('Very Slow Query'), {
        query,
        duration,
        ...metadata
      });
    }
  }

  /**
   * Update connection pool metrics
   */
  private updatePoolMetrics(pool: any): void {
    const poolMetrics = {
      totalCount: pool.totalCount || 0,
      idleCount: pool.idleCount || 0,
      waitingCount: pool.waitingCount || 0
    };

    // Update gauges
    monitoringService['dbConnectionPoolSize'].set(poolMetrics.totalCount);

    // Check for pool exhaustion
    if (poolMetrics.idleCount === 0 && poolMetrics.waitingCount > 0) {
      console.warn('[CONNECTION POOL]', 'Pool may be exhausted', poolMetrics);
    }
  }

  /**
   * Add query to history
   */
  private addToHistory(queryInfo: any): void {
    this.queryHistory.push(queryInfo);

    // Keep only last 1000 queries
    if (this.queryHistory.length > 1000) {
      this.queryHistory = this.queryHistory.slice(-500);
    }
  }

  /**
   * Get active queries
   */
  getActiveQueries(): QueryInfo[] {
    return Array.from(this.activeQueries.values());
  }

  /**
   * Get slow queries from history
   */
  getSlowQueries(threshold: number = 100, limit: number = 100): any[] {
    return this.queryHistory
      .filter(q => q.duration > threshold)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  /**
   * Get query statistics
   */
  getQueryStatistics(): any {
    if (this.queryHistory.length === 0) {
      return {
        totalQueries: 0,
        avgDuration: 0,
        slowQueries: 0,
        activeQueries: this.activeQueries.size
      };
    }

    const durations = this.queryHistory.map(q => q.duration);
    const slowCount = durations.filter(d => d > 100).length;

    return {
      totalQueries: this.queryHistory.length,
      avgDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      slowQueries: slowCount,
      slowRate: (slowCount / this.queryHistory.length) * 100,
      activeQueries: this.activeQueries.size,
      connectionCount: this.connections.size
    };
  }

  /**
   * Get connection pool status
   */
  getPoolStatus(): any {
    const connections = Array.from(this.connections.values());
    const now = Date.now();

    return {
      activeConnections: connections.length,
      connections: connections.map(conn => ({
        id: conn.id,
        age: now - conn.createdAt,
        idleTime: now - conn.lastUsed,
        queryCount: conn.queryCount
      }))
    };
  }

  /**
   * Analyze query patterns
   */
  analyzeQueryPatterns(): any {
    const patterns: Map<string, any> = new Map();

    for (const query of this.queryHistory) {
      const normalized = this.normalizeQuery(query.query);

      if (!patterns.has(normalized)) {
        patterns.set(normalized, {
          pattern: normalized,
          count: 0,
          totalDuration: 0,
          avgDuration: 0,
          examples: []
        });
      }

      const pattern = patterns.get(normalized)!;
      pattern.count++;
      pattern.totalDuration += query.duration;
      pattern.avgDuration = pattern.totalDuration / pattern.count;

      if (pattern.examples.length < 3) {
        pattern.examples.push({
          query: query.query.substring(0, 100),
          duration: query.duration
        });
      }
    }

    return Array.from(patterns.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }

  /**
   * Generate unique query ID
   */
  private generateQueryId(): string {
    return `query_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Export query metrics
   */
  exportMetrics(): any {
    return {
      statistics: this.getQueryStatistics(),
      slowQueries: this.getSlowQueries(),
      patterns: this.analyzeQueryPatterns(),
      poolStatus: this.getPoolStatus()
    };
  }

  /**
   * Clear all monitoring data
   */
  clear(): void {
    this.activeQueries.clear();
    this.connections.clear();
    this.queryHistory = [];
    this.n1DetectionCache.clear();
  }
}

// Export singleton instance
export const databaseMonitor = new DatabaseMonitor();

/**
 * Convenience function to wrap an existing pool
 */
export function monitorDatabasePool(pool: Pool): Pool {
  return databaseMonitor.wrapPool(pool);
}

/**
 * PostgreSQL specific monitoring utilities
 */
export class PostgreSQLMonitor {
  constructor(private pool: Pool) {}

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<any> {
    const query = `
      SELECT
        numbackends as active_connections,
        xact_commit as transactions_committed,
        xact_rollback as transactions_rolled_back,
        blks_read as blocks_read,
        blks_hit as blocks_hit,
        tup_returned as tuples_returned,
        tup_fetched as tuples_fetched,
        tup_inserted as tuples_inserted,
        tup_updated as tuples_updated,
        tup_deleted as tuples_deleted
      FROM pg_stat_database
      WHERE datname = current_database()
    `;

    const result = await this.pool.query(query);
    return result.rows[0];
  }

  /**
   * Get table statistics
   */
  async getTableStats(): Promise<any[]> {
    const query = `
      SELECT
        schemaname,
        tablename,
        n_live_tup as live_tuples,
        n_dead_tup as dead_tuples,
        n_tup_ins as inserts,
        n_tup_upd as updates,
        n_tup_del as deletes,
        n_tup_hot_upd as hot_updates,
        seq_scan as sequential_scans,
        idx_scan as index_scans
      FROM pg_stat_user_tables
      ORDER BY n_live_tup DESC
      LIMIT 20
    `;

    const result = await this.pool.query(query);
    return result.rows;
  }

  /**
   * Get index usage statistics
   */
  async getIndexStats(): Promise<any[]> {
    const query = `
      SELECT
        schemaname,
        tablename,
        indexname,
        idx_scan as index_scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched,
        pg_size_pretty(pg_relation_size(indexrelid)) as index_size
      FROM pg_stat_user_indexes
      ORDER BY idx_scan DESC
      LIMIT 20
    `;

    const result = await this.pool.query(query);
    return result.rows;
  }

  /**
   * Get slow queries from pg_stat_statements
   */
  async getSlowQueriesFromDB(limit: number = 20): Promise<any[]> {
    // Note: Requires pg_stat_statements extension
    const query = `
      SELECT
        query,
        calls,
        total_exec_time,
        mean_exec_time,
        stddev_exec_time,
        rows
      FROM pg_stat_statements
      WHERE query NOT LIKE '%pg_stat_statements%'
      ORDER BY mean_exec_time DESC
      LIMIT $1
    `;

    try {
      const result = await this.pool.query(query, [limit]);
      return result.rows;
    } catch (error) {
      // Extension might not be installed
      console.warn('pg_stat_statements extension not available');
      return [];
    }
  }

  /**
   * Get lock information
   */
  async getLocks(): Promise<any[]> {
    const query = `
      SELECT
        pid,
        usename,
        application_name,
        client_addr,
        backend_start,
        state,
        wait_event,
        wait_event_type,
        query
      FROM pg_stat_activity
      WHERE state != 'idle'
      ORDER BY backend_start
    `;

    const result = await this.pool.query(query);
    return result.rows;
  }

  /**
   * Check for database bloat
   */
  async checkBloat(): Promise<any[]> {
    const query = `
      SELECT
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
        pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as indexes_size,
        round(100 * pg_total_relation_size(schemaname||'.'||tablename) / sum(pg_total_relation_size(schemaname||'.'||tablename)) OVER (), 2) as percent_of_total
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      LIMIT 10
    `;

    const result = await this.pool.query(query);
    return result.rows;
  }

  /**
   * Get cache hit ratio
   */
  async getCacheHitRatio(): Promise<number> {
    const query = `
      SELECT
        sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) as cache_hit_ratio
      FROM pg_statio_user_tables
    `;

    const result = await this.pool.query(query);
    return result.rows[0]?.cache_hit_ratio || 0;
  }

  /**
   * Export all database metrics
   */
  async exportAllMetrics(): Promise<any> {
    const [
      dbStats,
      tableStats,
      indexStats,
      locks,
      bloat,
      cacheHitRatio
    ] = await Promise.all([
      this.getDatabaseStats(),
      this.getTableStats(),
      this.getIndexStats(),
      this.getLocks(),
      this.checkBloat(),
      this.getCacheHitRatio()
    ]);

    return {
      database: dbStats,
      tables: tableStats,
      indexes: indexStats,
      locks,
      bloat,
      cacheHitRatio
    };
  }
}