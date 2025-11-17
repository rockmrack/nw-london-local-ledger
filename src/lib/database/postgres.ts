/**
 * PostgreSQL Database Connection
 * Centralized database connection and query utilities
 */

import { Pool, PoolClient } from 'pg';
import { logger } from '@/lib/logging/logger';

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection cannot be established
});

// Error handling
pool.on('error', (err, client) => {
  logger.error('Unexpected error on idle database client', err);
});

/**
 * Connect to the database
 */
export async function connectDb(): Promise<void> {
  try {
    const client = await pool.connect();
    client.release();
    logger.info('✅ Database connected');
  } catch (error) {
    logger.error('Failed to connect to database:', error);
    throw error;
  }
}

/**
 * Execute a query
 */
export async function query(text: string, params?: any[]): Promise<any> {
  const start = Date.now();

  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;

    logger.debug('Executed query', { text, duration, rows: res.rowCount });

    return res;
  } catch (error) {
    logger.error('Database query error:', { text, error });
    throw error;
  }
}

/**
 * Get a client for transaction
 */
export async function getClient(): Promise<PoolClient> {
  const client = await pool.connect();
  return client;
}

/**
 * Execute a transaction
 */
export async function transaction(callback: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await getClient();

  try {
    await client.query('BEGIN');
    await callback(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Close database connection
 */
export async function closeDb(): Promise<void> {
  try {
    await pool.end();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error('Error closing database connection:', error);
    throw error;
  }
}

/**
 * Check database connection
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const result = await query('SELECT NOW()');
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Upsert helper function
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

  let query = `
    INSERT INTO ${table} (${keys.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT (${conflictColumns.join(', ')})
  `;

  if (updateColumns && updateColumns.length > 0) {
    const updates = updateColumns.map(col => `${col} = EXCLUDED.${col}`).join(', ');
    query += ` DO UPDATE SET ${updates}, updated_at = NOW()`;
  } else {
    query += ' DO NOTHING';
  }

  query += ' RETURNING *';

  const result = await pool.query(query, values);
  return result.rows[0];
}

/**
 * Bulk insert helper
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

  let query = `
    INSERT INTO ${table} (${keys.join(', ')})
    VALUES ${placeholders.join(', ')}
  `;

  if (onConflict) {
    query += ` ${onConflict}`;
  }

  const result = await pool.query(query, values);
  return result.rowCount;
}

export default pool;