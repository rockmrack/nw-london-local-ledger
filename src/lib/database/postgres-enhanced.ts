/**
 * Enhanced PostgreSQL Database Connection
 * Backward-compatible wrapper that uses the new read replica pool system
 */

import { PoolClient, QueryResult } from 'pg';
import { logger } from '@/lib/logging/logger';
import { getReadReplicaPool, ReadReplicaPool, QueryOptions } from './read-replica-pool';
import { ConsistencyLevel } from './query-analyzer';

// Get the read replica pool instance
const replicaPool: ReadReplicaPool = getReadReplicaPool();

// Track if we've initialized
let isInitialized = false;

/**
 * Connect to the database (backward compatible)
 */
export async function connectDb(): Promise<void> {
  try {
    if (!isInitialized) {
      // Perform health check
      const health = await replicaPool.healthCheck();

      if (!health.healthy) {
        throw new Error('Database connection unhealthy');
      }

      isInitialized = true;
      logger.info('✅ Enhanced database connected with read replicas', {
        primary: health.primary,
        replicas: health.replicas.length,
        healthyReplicas: health.replicas.filter(r => r.healthy).length,
      });
    }
  } catch (error) {
    logger.error('Failed to connect to enhanced database:', error);
    throw error;
  }
}

/**
 * Execute a query (backward compatible with smart routing)
 */
export async function query(text: string, params?: any[]): Promise<any> {
  const start = Date.now();

  try {
    // Determine query options based on the SQL
    const options: QueryOptions = {
      cached: shouldCacheQuery(text),
      consistency: determineConsistencyLevel(text),
      timeout: determineTimeout(text),
      retryOnFailure: true,
      maxRetries: 3,
    };

    const res = await replicaPool.query(text, params, options);
    const duration = Date.now() - start;

    logger.debug('Executed query', {
      text: text.substring(0, 100),
      duration,
      rows: res.rowCount,
      cached: options.cached,
    });

    return res;
  } catch (error) {
    logger.error('Enhanced database query error:', { text, error });
    throw error;
  }
}

/**
 * Get a client for transaction (always uses primary)
 */
export async function getClient(): Promise<PoolClient> {
  // Transactions always use the primary database
  return replicaPool['connectionManager'].getPrimaryConnection();
}

/**
 * Execute a transaction (backward compatible)
 */
export async function transaction(callback: (client: PoolClient) => Promise<void>): Promise<void> {
  return replicaPool.transaction(callback, {
    isolationLevel: 'READ COMMITTED',
  });
}

/**
 * Close database connection (backward compatible)
 */
export async function closeDb(): Promise<void> {
  try {
    await replicaPool.shutdown();
    logger.info('Enhanced database connections closed');
  } catch (error) {
    logger.error('Error closing enhanced database connections:', error);
    throw error;
  }
}

/**
 * Check database connection (backward compatible)
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const health = await replicaPool.healthCheck();
    return health.healthy;
  } catch (error) {
    return false;
  }
}

/**
 * Upsert helper function (backward compatible)
 */
export async function upsert(
  table: string,
  data: Record<string, any>,
  conflictColumns: string[],
  updateColumns?: string[]
): Promise<any> {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

  let queryText = `
    INSERT INTO ${table} (${keys.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT (${conflictColumns.join(', ')})
  `;

  if (updateColumns && updateColumns.length > 0) {
    const updates = updateColumns.map(col => `${col} = EXCLUDED.${col}`).join(', ');
    queryText += ` DO UPDATE SET ${updates}, updated_at = NOW()`;
  } else {
    queryText += ' DO NOTHING';
  }

  queryText += ' RETURNING *';

  // Upserts are write operations, force primary
  const result = await replicaPool.query(queryText, values, {
    forceWrite: true,
    consistency: ConsistencyLevel.STRONG,
  });

  return result.rows[0];
}

/**
 * Bulk insert helper (backward compatible)
 */
export async function bulkInsert(
  table: string,
  records: Record<string, any>[],
  onConflict?: string
): Promise<number> {
  if (records.length === 0) return 0;

  const keys = Object.keys(records[0]);
  const values: any[] = [];
  const placeholders: string[] = [];

  records.forEach((record, recordIndex) => {
    const rowPlaceholders = keys.map((key, keyIndex) => {
      const paramIndex = recordIndex * keys.length + keyIndex + 1;
      values.push(record[key]);
      return `$${paramIndex}`;
    });
    placeholders.push(`(${rowPlaceholders.join(', ')})`);
  });

  let queryText = `
    INSERT INTO ${table} (${keys.join(', ')})
    VALUES ${placeholders.join(', ')}
  `;

  if (onConflict) {
    queryText += ` ${onConflict}`;
  }

  // Bulk inserts are write operations, force primary
  const result = await replicaPool.query(queryText, values, {
    forceWrite: true,
    consistency: ConsistencyLevel.STRONG,
  });

  return result.rowCount;
}

/**
 * Enhanced query with options (new functionality)
 */
export async function queryWithOptions(
  text: string,
  params?: any[],
  options?: QueryOptions
): Promise<QueryResult> {
  return replicaPool.query(text, params, options);
}

/**
 * Prepare a statement for better performance
 */
export async function prepareStatement(name: string, text: string, types?: any[]): Promise<void> {
  return replicaPool.prepare(name, text, types);
}

/**
 * Execute a prepared statement
 */
export async function executePrepared(
  name: string,
  params?: any[],
  options?: QueryOptions
): Promise<QueryResult> {
  return replicaPool.execute(name, params, options);
}

/**
 * Clear query cache
 */
export async function clearCache(pattern?: string): Promise<void> {
  return replicaPool.clearCache(pattern);
}

/**
 * Get database statistics
 */
export function getStats() {
  return replicaPool.getStats();
}

/**
 * Perform health check
 */
export async function healthCheck() {
  return replicaPool.healthCheck();
}

// Helper functions for determining query options
function shouldCacheQuery(text: string): boolean {
  const normalizedText = text.toUpperCase().trim();

  // Cache SELECT queries on relatively stable tables
  if (normalizedText.startsWith('SELECT')) {
    const cacheTables = ['properties', 'councils', 'amenities', 'transport_stops', 'areas'];
    return cacheTables.some(table => text.toLowerCase().includes(table));
  }

  return false;
}

function determineConsistencyLevel(text: string): ConsistencyLevel {
  const normalizedText = text.toUpperCase().trim();

  // Strong consistency for writes and critical reads
  if (
    normalizedText.startsWith('INSERT') ||
    normalizedText.startsWith('UPDATE') ||
    normalizedText.startsWith('DELETE') ||
    normalizedText.includes('FOR UPDATE')
  ) {
    return ConsistencyLevel.STRONG;
  }

  // Bounded consistency for user-facing reads
  if (normalizedText.includes('properties') && normalizedText.includes('WHERE')) {
    return ConsistencyLevel.BOUNDED;
  }

  // Eventual consistency for analytics and reporting
  return ConsistencyLevel.EVENTUAL;
}

function determineTimeout(text: string): number {
  const normalizedText = text.toUpperCase().trim();

  // Longer timeout for complex queries
  if (
    normalizedText.includes('JOIN') ||
    normalizedText.includes('GROUP BY') ||
    normalizedText.includes('UNION')
  ) {
    return 30000; // 30 seconds
  }

  // Short timeout for simple queries
  if (normalizedText.startsWith('SELECT') && !normalizedText.includes('JOIN')) {
    return 5000; // 5 seconds
  }

  // Default timeout
  return 10000; // 10 seconds
}

// Export the enhanced pool for direct access when needed
export const pool = replicaPool;

// Export default for backward compatibility
export default {
  connectDb,
  query,
  getClient,
  transaction,
  closeDb,
  checkConnection,
  upsert,
  bulkInsert,
  queryWithOptions,
  prepareStatement,
  executePrepared,
  clearCache,
  getStats,
  healthCheck,
  pool,
};