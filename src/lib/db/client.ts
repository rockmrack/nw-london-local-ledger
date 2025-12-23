/**
 * Database client configuration
 * Using postgres library for PostgreSQL connections
 */

import postgres from 'postgres';

// Database connection configuration
const connectionString = process.env.DATABASE_URL;

// Don't create client if no DATABASE_URL provided
if (!connectionString) {
  console.warn('⚠️ DATABASE_URL not set - database operations will fail');
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

// Lazy database connection - create wrapper function for build-time safety
let _sql: postgres.Sql<{}> | null = null;

function getClient(): postgres.Sql<{}> {
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  if (!_sql) {
    _sql = postgres(connectionString, options);
  }
  return _sql;
}

// Wrapper function that delegates to the actual client
// This prevents eager initialization during build
const createQueryProxy = () => {
  return new Proxy((() => {}) as unknown as postgres.Sql<{}>, {
    get(_, prop) {
      return (getClient() as any)[prop];
    },
    apply(_, __, args) {
      return (getClient() as any)(...args);
    }
  });
};

// Export for webpack - uses function call delegation
const sql = createQueryProxy();

// Type-safe query helper
export type SQL = postgres.Sql<{}>;

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

// Export for use in other modules (both named and default)
export { sql };
export default sql;
