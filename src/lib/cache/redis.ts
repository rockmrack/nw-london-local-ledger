/**
 * Redis client configuration for caching with enhanced features
 */

import { createClient } from 'redis';
import crypto from 'crypto';

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

// Cache statistics for monitoring
const cacheStats = {
  hits: 0,
  misses: 0,
  sets: 0,
  deletes: 0,
  errors: 0,
};

// Stampede protection locks
const stampedeProtection = new Map<string, Promise<any>>();

// Tag tracking prefix
const TAG_PREFIX = 'tag:';
const TAGS_KEY_PREFIX = 'tags:';

export function getCacheStats() {
  const total = cacheStats.hits + cacheStats.misses;
  return {
    ...cacheStats,
    hitRate: total > 0 ? cacheStats.hits / total : 0,
    missRate: total > 0 ? cacheStats.misses / total : 0,
  };
}

export function resetCacheStats() {
  cacheStats.hits = 0;
  cacheStats.misses = 0;
  cacheStats.sets = 0;
  cacheStats.deletes = 0;
  cacheStats.errors = 0;
}

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
 * Get a value from cache with stampede protection
 */
export async function getCache<T>(
  key: string,
  options?: {
    loader?: () => Promise<T>;
    ttl?: number;
    tags?: string[];
  }
): Promise<T | null> {
  try {
    const value = await redisClient.get(key);

    if (value) {
      cacheStats.hits++;
      return JSON.parse(value);
    }

    cacheStats.misses++;

    // Stampede protection with loader
    if (options?.loader) {
      // Check if already loading
      const existingLoader = stampedeProtection.get(key);
      if (existingLoader) {
        return await existingLoader;
      }

      // Create new loader promise
      const loaderPromise = (async () => {
        try {
          const data = await options.loader!();
          await setCache(key, data, options.ttl, options.tags);
          return data;
        } finally {
          stampedeProtection.delete(key);
        }
      })();

      stampedeProtection.set(key, loaderPromise);
      return await loaderPromise;
    }

    return null;
  } catch (error) {
    cacheStats.errors++;
    console.error(`Error getting cache for key ${key}:`, error);
    return null;
  }
}

/**
 * Set a value in cache with optional TTL and tags
 */
export async function setCache<T>(
  key: string,
  value: T,
  ttlSeconds?: number,
  tags?: string[]
): Promise<void> {
  try {
    const serialized = JSON.stringify(value);

    // Use transaction for atomic operations
    const multi = redisClient.multi();

    // Set the main value
    if (ttlSeconds) {
      multi.setEx(key, ttlSeconds, serialized);
    } else {
      multi.set(key, serialized);
    }

    // Handle tags if provided
    if (tags && tags.length > 0) {
      // Store tags for this key
      multi.sAdd(`${TAGS_KEY_PREFIX}${key}`, tags);
      if (ttlSeconds) {
        multi.expire(`${TAGS_KEY_PREFIX}${key}`, ttlSeconds);
      }

      // Add key to tag sets
      for (const tag of tags) {
        multi.sAdd(`${TAG_PREFIX}${tag}`, key);
      }
    }

    await multi.exec();
    cacheStats.sets++;
  } catch (error) {
    cacheStats.errors++;
    console.error(`Error setting cache for key ${key}:`, error);
  }
}

/**
 * Delete a value from cache and clean up tags
 */
export async function deleteCache(key: string): Promise<void> {
  try {
    // Get tags for this key
    const tags = await redisClient.sMembers(`${TAGS_KEY_PREFIX}${key}`);

    const multi = redisClient.multi();

    // Delete the key
    multi.del(key);

    // Delete tags metadata
    multi.del(`${TAGS_KEY_PREFIX}${key}`);

    // Remove key from tag sets
    if (tags.length > 0) {
      for (const tag of tags) {
        multi.sRem(`${TAG_PREFIX}${tag}`, key);
      }
    }

    await multi.exec();
    cacheStats.deletes++;
  } catch (error) {
    cacheStats.errors++;
    console.error(`Error deleting cache for key ${key}:`, error);
  }
}

/**
 * Delete all cache entries with a specific tag
 */
export async function deleteCacheByTag(tag: string): Promise<number> {
  try {
    // Get all keys with this tag
    const keys = await redisClient.sMembers(`${TAG_PREFIX}${tag}`);

    if (keys.length === 0) return 0;

    // Delete all keys
    for (const key of keys) {
      await deleteCache(key);
    }

    // Clean up the tag set
    await redisClient.del(`${TAG_PREFIX}${tag}`);

    return keys.length;
  } catch (error) {
    cacheStats.errors++;
    console.error(`Error deleting cache by tag ${tag}:`, error);
    return 0;
  }
}

/**
 * Delete cache entries by multiple tags (OR operation)
 */
export async function deleteCacheByTags(tags: string[]): Promise<number> {
  let totalDeleted = 0;
  for (const tag of tags) {
    totalDeleted += await deleteCacheByTag(tag);
  }
  return totalDeleted;
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
 * Batch set multiple key-value pairs with tags support
 */
export async function batchSetCache<T>(
  entries: Array<{
    key: string;
    value: T;
    ttlSeconds?: number;
    tags?: string[];
  }>
): Promise<void> {
  try {
    if (entries.length === 0) return;

    const pipeline = redisClient.multi();

    for (const { key, value, ttlSeconds, tags } of entries) {
      const serialized = JSON.stringify(value);

      // Set the value
      if (ttlSeconds) {
        pipeline.setEx(key, ttlSeconds, serialized);
      } else {
        pipeline.set(key, serialized);
      }

      // Handle tags
      if (tags && tags.length > 0) {
        pipeline.sAdd(`${TAGS_KEY_PREFIX}${key}`, tags);
        if (ttlSeconds) {
          pipeline.expire(`${TAGS_KEY_PREFIX}${key}`, ttlSeconds);
        }
        for (const tag of tags) {
          pipeline.sAdd(`${TAG_PREFIX}${tag}`, key);
        }
      }
    }

    await pipeline.exec();
    cacheStats.sets += entries.length;
  } catch (error) {
    cacheStats.errors++;
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

export default redisClient;
