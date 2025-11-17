/**
 * Database client configuration
 * Using postgres library for PostgreSQL connections
 */

import postgres from 'postgres';

// Database connection configuration
const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/nw_ledger';

const options: postgres.Options<{}> = {
  max: parseInt(process.env.DATABASE_POOL_MAX || '50', 10), // Increased from 10 to 50 for better concurrency
  idle_timeout: 20,
  connect_timeout: 10,
  max_lifetime: 60 * 30, // 30 minutes - rotate connections to prevent stale connections
  prepare: true, // Enable prepared statements for better performance
  transform: {
    undefined: null, // Transform undefined to null for safer queries
  },
  onnotice: () => {}, // Suppress notices for cleaner logs
};

// Create database connection
export const sql = postgres(connectionString, options);

// Type-safe query helper
export type SQL = typeof sql;

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

/**
 * Close database connection
 * Should be called when shutting down the application
 */
export async function closeConnection(): Promise<void> {
  await sql.end({ timeout: 5 });
  console.log('Database connection closed');
}

// Export for use in other modules
export default sql;
