/**
 * Database client configuration
 * Using postgres library for PostgreSQL connections
 */

import postgres from 'postgres';

// Database connection configuration
const connectionString = process.env.DATABASE_URL;

// Warn if database is not configured
if (!connectionString) {
  console.warn('⚠️  DATABASE_URL not configured - database operations will be unavailable');
}

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

// Lazy database connection
let _sql: postgres.Sql<{}> | null = null;

function getClient(): postgres.Sql<{}> | null {
  // Don't create client if database URL is not configured
  if (!connectionString) {
    return null;
  }

  if (!_sql) {
    _sql = postgres(connectionString, options);
  }
  return _sql;
}

// Create database connection proxy for lazy initialization
export const sql = new Proxy({} as postgres.Sql<{}>, {
  get(target, prop) {
    const client = getClient();
    if (!client) {
      throw new Error('Database not configured - set DATABASE_URL environment variable');
    }
    const value = (client as any)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
  apply(target, thisArg, args) {
    const client = getClient();
    if (!client) {
      throw new Error('Database not configured - set DATABASE_URL environment variable');
    }
    return (client as any)(...args);
  }
});

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
