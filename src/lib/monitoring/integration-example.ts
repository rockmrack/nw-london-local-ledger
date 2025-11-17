/**
 * Example integration of monitoring with existing application code
 */

import { Pool } from 'pg';
import Redis from 'redis';
import {
  monitoringService,
  monitorDatabasePool,
  monitorQuery,
  monitorCache,
  monitorQueueJob,
  withMonitoring,
  createSpan,
  Monitor
} from './index';

// ============================================
// DATABASE INTEGRATION EXAMPLE
// ============================================

// Original database pool
const originalPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Wrap the pool with monitoring
export const monitoredPool = monitorDatabasePool(originalPool);

// Example: Monitored database query function
export const findUserById = monitorQuery(
  async (userId: string) => {
    const result = await monitoredPool.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0];
  },
  'findUserById'
);

// Example: Monitored transaction
export async function createUserWithProfile(userData: any, profileData: any) {
  const requestId = monitoringService.startOperation('createUserWithProfile');
  const client = await monitoredPool.connect();

  try {
    // Start transaction span
    const txSpan = createSpan(requestId, 'db.transaction');

    await client.query('BEGIN');

    // Insert user
    const userSpan = createSpan(requestId, 'db.insert.user');
    const userResult = await client.query(
      'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id',
      [userData.email, userData.name]
    );
    userSpan.end();

    // Insert profile
    const profileSpan = createSpan(requestId, 'db.insert.profile');
    await client.query(
      'INSERT INTO profiles (user_id, bio) VALUES ($1, $2)',
      [userResult.rows[0].id, profileData.bio]
    );
    profileSpan.end();

    await client.query('COMMIT');
    txSpan.end();

    monitoringService.endOperation(requestId, { success: true });
    return userResult.rows[0];

  } catch (error) {
    await client.query('ROLLBACK');
    monitoringService.recordError(error as Error, { operation: 'createUserWithProfile' });
    monitoringService.endOperation(requestId, { success: false, error: (error as Error).message });
    throw error;

  } finally {
    client.release();
  }
}

// ============================================
// CACHE INTEGRATION EXAMPLE
// ============================================

const redisClient = Redis.createClient({
  url: process.env.REDIS_URL
});

// Wrap cache operations with monitoring
export const getCachedData = monitorCache(
  async (key: string) => {
    return await redisClient.get(key);
  },
  (args) => args[0] // Extract key for monitoring
);

export const setCachedData = async (key: string, value: any, ttl: number = 3600) => {
  const span = createSpan('', 'cache.set', { key, ttl });
  try {
    await redisClient.setEx(key, ttl, JSON.stringify(value));
    monitoringService.recordCacheOperation(true, key, { operation: 'set' });
    span.end();
  } catch (error) {
    monitoringService.recordCacheOperation(false, key, {
      operation: 'set',
      error: (error as Error).message
    });
    span.end();
    throw error;
  }
};

// ============================================
// API ROUTE INTEGRATION EXAMPLE
// ============================================

// Example: Monitored API route handler
export const getUserHandler = withMonitoring(
  async (req: any, res: any) => {
    const userId = req.params.id;

    // Check cache first
    const cacheKey = `user:${userId}`;
    const cached = await getCachedData(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from database
    const user = await findUserById(userId);

    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    // Cache the result
    await setCachedData(cacheKey, user);

    return user;
  },
  { operation: 'api.getUser' }
);

// ============================================
// QUEUE JOB INTEGRATION EXAMPLE
// ============================================

// Example: Monitored queue job processor
export const processEmailJob = monitorQueueJob(
  async (job: any) => {
    const { to, subject, body } = job.data;

    // Simulate email sending
    await new Promise(resolve => setTimeout(resolve, 100));

    if (Math.random() > 0.95) {
      throw new Error('Email service temporarily unavailable');
    }

    return { sent: true, to, timestamp: Date.now() };
  },
  'emailJob'
);

// ============================================
// CLASS-BASED SERVICE INTEGRATION EXAMPLE
// ============================================

export class UserService {
  /**
   * Monitored method using decorator
   */
  @Monitor('UserService.findAll')
  async findAllUsers(limit: number = 100) {
    const result = await monitoredPool.query(
      'SELECT * FROM users ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  }

  /**
   * Complex operation with multiple spans
   */
  async searchUsers(query: string) {
    const requestId = monitoringService.startOperation('UserService.searchUsers');

    try {
      // Check cache
      const cacheSpan = createSpan(requestId, 'cache.check');
      const cacheKey = `search:${query}`;
      const cached = await getCachedData(cacheKey);
      cacheSpan.end();

      if (cached) {
        monitoringService.endOperation(requestId, { source: 'cache' });
        return JSON.parse(cached);
      }

      // Search in database
      const dbSpan = createSpan(requestId, 'db.search');
      const result = await monitoredPool.query(
        `SELECT * FROM users
         WHERE name ILIKE $1 OR email ILIKE $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [`%${query}%`]
      );
      dbSpan.end();

      // Cache results
      const cacheSetSpan = createSpan(requestId, 'cache.set');
      await setCachedData(cacheKey, result.rows, 300); // 5 min TTL
      cacheSetSpan.end();

      monitoringService.endOperation(requestId, {
        source: 'database',
        resultCount: result.rows.length
      });

      return result.rows;

    } catch (error) {
      monitoringService.recordError(error as Error, {
        operation: 'UserService.searchUsers',
        query
      });
      monitoringService.endOperation(requestId, {
        success: false,
        error: (error as Error).message
      });
      throw error;
    }
  }
}

// ============================================
// BATCH OPERATION EXAMPLE
// ============================================

import { BatchMonitor } from './middleware';

export async function batchUpdateUsers(updates: Array<{ id: string; data: any }>) {
  const batch = new BatchMonitor('batchUpdateUsers');

  for (const update of updates) {
    try {
      const startTime = Date.now();

      await monitoredPool.query(
        'UPDATE users SET data = $1, updated_at = NOW() WHERE id = $2',
        [update.data, update.id]
      );

      batch.addOperation({
        id: update.id,
        duration: Date.now() - startTime,
        success: true
      });

    } catch (error) {
      batch.addOperation({
        id: update.id,
        success: false,
        error: (error as Error).message
      });
    }
  }

  batch.complete({ totalUpdates: updates.length });
}

// ============================================
// MEMORY LEAK DETECTION EXAMPLE
// ============================================

import { MemoryMonitor } from './middleware';

export function setupMemoryLeakDetection() {
  const memoryMonitor = new MemoryMonitor();

  // Take snapshots periodically
  setInterval(() => {
    memoryMonitor.takeSnapshot(`snapshot_${Date.now()}`);

    // Check for memory leak
    if (memoryMonitor.detectLeak()) {
      monitoringService.recordError(new Error('Potential memory leak detected'), {
        type: 'memoryLeak',
        snapshots: memoryMonitor['snapshots'].size
      });
    }
  }, 60000); // Every minute

  return memoryMonitor;
}

// ============================================
// CUSTOM METRICS EXAMPLE
// ============================================

import { metrics } from './metrics';

// Create custom business metrics
const userRegistrations = metrics.createCounter(
  'user_registrations_total',
  'Total number of user registrations'
);

const activeUsers = metrics.createGauge(
  'active_users',
  'Number of currently active users'
);

const searchLatency = metrics.createHistogram(
  'search_latency_seconds',
  'Search operation latency in seconds',
  [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
);

export function recordUserRegistration(userId: string, source: string) {
  userRegistrations.inc(1, { source });
  monitoringService.recordApiRequest('POST', '/api/register', 201, 0, { userId, source });
}

export function updateActiveUsers(count: number) {
  activeUsers.set(count);
}

export function recordSearchPerformance(duration: number, resultCount: number) {
  searchLatency.observe(duration / 1000, {
    hasResults: resultCount > 0 ? 'true' : 'false'
  });
}

// ============================================
// INITIALIZATION EXAMPLE
// ============================================

export async function initializeApplicationMonitoring() {
  // Initialize monitoring with custom config
  const monitoring = (await import('./index')).initializeMonitoring({
    sampleRate: 0.1, // Sample 10% of requests in production
    slowQueryThreshold: 100,
    slowApiThreshold: 1000,
    errorRateThreshold: 5,
    memoryThreshold: 85,
    cpuThreshold: 80,
    retentionDays: 30
  });

  // Set up memory leak detection
  setupMemoryLeakDetection();

  // Connect to databases and caches
  await redisClient.connect();

  console.log('Application monitoring initialized');

  return monitoring;
}