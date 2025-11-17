/**
 * Redis client configuration for caching
 */

import { createClient } from 'redis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Create Redis client
const redisClient = createClient({
  url: redisUrl,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error('Too many Redis reconnection attempts');
        return new Error('Too many retries');
      }
      return Math.min(retries * 100, 3000);
    },
  },
});

// Error handling
redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  console.log('✅ Redis connected');
});

// Connect to Redis
let isConnected = false;

export async function connectRedis(): Promise<void> {
  if (!isConnected) {
    await redisClient.connect();
    isConnected = true;
  }
}

/**
 * Get a value from cache
 */
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const value = await redisClient.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error(`Error getting cache for key ${key}:`, error);
    return null;
  }
}

/**
 * Set a value in cache with optional TTL
 */
export async function setCache<T>(
  key: string,
  value: T,
  ttlSeconds?: number
): Promise<void> {
  try {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await redisClient.setEx(key, ttlSeconds, serialized);
    } else {
      await redisClient.set(key, serialized);
    }
  } catch (error) {
    console.error(`Error setting cache for key ${key}:`, error);
  }
}

/**
 * Delete a value from cache
 */
export async function deleteCache(key: string): Promise<void> {
  try {
    await redisClient.del(key);
  } catch (error) {
    console.error(`Error deleting cache for key ${key}:`, error);
  }
}

/**
 * Delete multiple keys by pattern
 */
export async function deleteCacheByPattern(pattern: string): Promise<void> {
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch (error) {
    console.error(`Error deleting cache by pattern ${pattern}:`, error);
  }
}

/**
 * Check if a key exists in cache
 */
export async function existsInCache(key: string): Promise<boolean> {
  try {
    const exists = await redisClient.exists(key);
    return exists === 1;
  } catch (error) {
    console.error(`Error checking cache existence for key ${key}:`, error);
    return false;
  }
}

/**
 * Increment a counter in cache
 */
export async function incrementCache(key: string): Promise<number> {
  try {
    return await redisClient.incr(key);
  } catch (error) {
    console.error(`Error incrementing cache for key ${key}:`, error);
    return 0;
  }
}

/**
 * Batch get multiple keys using pipeline (5-10x faster than individual gets)
 */
export async function batchGetCache<T>(keys: string[]): Promise<Map<string, T | null>> {
  try {
    if (keys.length === 0) return new Map();

    const pipeline = redisClient.multi();
    keys.forEach(key => pipeline.get(key));

    const results = await pipeline.exec();
    const resultMap = new Map<string, T | null>();

    results.forEach((result, index) => {
      const value = result as string | null;
      resultMap.set(keys[index], value ? JSON.parse(value) : null);
    });

    return resultMap;
  } catch (error) {
    console.error('Error batch getting cache:', error);
    return new Map(keys.map(k => [k, null]));
  }
}

/**
 * Batch set multiple key-value pairs using pipeline (5-10x faster than individual sets)
 */
export async function batchSetCache<T>(
  entries: Array<{ key: string; value: T; ttlSeconds?: number }>
): Promise<void> {
  try {
    if (entries.length === 0) return;

    const pipeline = redisClient.multi();

    entries.forEach(({ key, value, ttlSeconds }) => {
      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        pipeline.setEx(key, ttlSeconds, serialized);
      } else {
        pipeline.set(key, serialized);
      }
    });

    await pipeline.exec();
  } catch (error) {
    console.error('Error batch setting cache:', error);
  }
}

/**
 * Batch delete multiple keys using pipeline
 */
export async function batchDeleteCache(keys: string[]): Promise<void> {
  try {
    if (keys.length === 0) return;

    // Process in chunks of 1000 to avoid overwhelming Redis
    const chunkSize = 1000;
    for (let i = 0; i < keys.length; i += chunkSize) {
      const chunk = keys.slice(i, i + chunkSize);
      await redisClient.del(chunk);
    }
  } catch (error) {
    console.error('Error batch deleting cache:', error);
  }
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (isConnected) {
    await redisClient.quit();
    isConnected = false;
    console.log('Redis connection closed');
  }
}

export { redisClient };
export default redisClient;
