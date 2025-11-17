/**
 * Custom Incremental Cache Handler for Next.js
 * Implements multi-tier caching with Redis and local file system
 */

const { IncrementalCache } = require('@neshca/cache-handler');
const Redis = require('ioredis');
const LRUCache = require('lru-cache');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Initialize Redis client with clustering support
const redis = new Redis.Cluster([
  {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
  },
], {
  redisOptions: {
    password: process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  },
  clusterRetryStrategy: (times) => Math.min(times * 50, 2000),
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
});

// In-memory LRU cache for hot data
const memoryCache = new LRUCache({
  max: 100, // Maximum number of items
  maxSize: 50 * 1024 * 1024, // 50MB
  sizeCalculation: (value) => Buffer.byteLength(JSON.stringify(value)),
  ttl: 1000 * 60 * 5, // 5 minutes
  updateAgeOnGet: true,
  updateAgeOnHas: true,
});

// File system cache directory
const CACHE_DIR = path.join(process.cwd(), '.next/cache/custom');

class CustomIncrementalCache {
  constructor() {
    this.initializeCache();
  }

  async initializeCache() {
    // Ensure cache directory exists
    await fs.mkdir(CACHE_DIR, { recursive: true });

    // Warm up cache with critical pages
    await this.warmUpCache();
  }

  async warmUpCache() {
    const criticalPaths = ['/', '/properties', '/search'];

    for (const path of criticalPaths) {
      const key = this.getCacheKey(path);
      try {
        // Try to preload from Redis
        const cached = await redis.get(key);
        if (cached) {
          memoryCache.set(key, JSON.parse(cached));
        }
      } catch (error) {
        console.error(`Failed to warm up cache for ${path}:`, error);
      }
    }
  }

  getCacheKey(key) {
    // Generate consistent cache key
    return `next:${crypto.createHash('md5').update(key).digest('hex')}`;
  }

  async get(key) {
    const cacheKey = this.getCacheKey(key);
    const startTime = Date.now();

    try {
      // 1. Check memory cache (fastest)
      const memoryValue = memoryCache.get(cacheKey);
      if (memoryValue) {
        console.log(`Memory cache hit for ${key} (${Date.now() - startTime}ms)`);
        return memoryValue;
      }

      // 2. Check Redis cache (fast)
      const redisValue = await redis.get(cacheKey);
      if (redisValue) {
        const parsed = JSON.parse(redisValue);
        // Update memory cache
        memoryCache.set(cacheKey, parsed);
        console.log(`Redis cache hit for ${key} (${Date.now() - startTime}ms)`);
        return parsed;
      }

      // 3. Check file system cache (slower)
      const filePath = path.join(CACHE_DIR, `${cacheKey}.json`);
      try {
        const fileContent = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(fileContent);

        // Check if cache is still valid
        if (parsed.expires && parsed.expires > Date.now()) {
          // Update faster caches
          memoryCache.set(cacheKey, parsed);
          await redis.setex(cacheKey, 3600, JSON.stringify(parsed));
          console.log(`File cache hit for ${key} (${Date.now() - startTime}ms)`);
          return parsed;
        }
      } catch (error) {
        // File doesn't exist or is corrupted
      }

      console.log(`Cache miss for ${key} (${Date.now() - startTime}ms)`);
      return null;
    } catch (error) {
      console.error(`Cache get error for ${key}:`, error);
      return null;
    }
  }

  async set(key, data, ctx = {}) {
    const cacheKey = this.getCacheKey(key);
    const startTime = Date.now();

    try {
      const value = {
        ...data,
        expires: ctx.revalidate
          ? Date.now() + (ctx.revalidate * 1000)
          : Date.now() + (3600 * 1000), // Default 1 hour
        timestamp: Date.now(),
      };

      // Update all cache layers in parallel
      const promises = [];

      // 1. Update memory cache
      memoryCache.set(cacheKey, value);

      // 2. Update Redis cache
      const ttl = ctx.revalidate || 3600;
      promises.push(
        redis.setex(cacheKey, ttl, JSON.stringify(value))
          .catch(error => console.error('Redis set error:', error))
      );

      // 3. Update file system cache
      const filePath = path.join(CACHE_DIR, `${cacheKey}.json`);
      promises.push(
        fs.writeFile(filePath, JSON.stringify(value, null, 2))
          .catch(error => console.error('File cache set error:', error))
      );

      // Add to cache manifest for tracking
      promises.push(this.updateManifest(key, cacheKey, ctx));

      await Promise.all(promises);

      console.log(`Cache set for ${key} (${Date.now() - startTime}ms)`);
      return true;
    } catch (error) {
      console.error(`Cache set error for ${key}:`, error);
      return false;
    }
  }

  async revalidateTag(tag) {
    const startTime = Date.now();
    console.log(`Revalidating tag: ${tag}`);

    try {
      // Get all keys associated with this tag
      const keys = await redis.smembers(`tag:${tag}`);

      const promises = keys.map(async (key) => {
        // Remove from all cache layers
        memoryCache.delete(key);
        await redis.del(key);

        const filePath = path.join(CACHE_DIR, `${key}.json`);
        await fs.unlink(filePath).catch(() => {}); // Ignore if file doesn't exist
      });

      await Promise.all(promises);

      // Clear the tag set
      await redis.del(`tag:${tag}`);

      console.log(`Revalidated ${keys.length} entries for tag ${tag} (${Date.now() - startTime}ms)`);
      return true;
    } catch (error) {
      console.error(`Revalidate tag error for ${tag}:`, error);
      return false;
    }
  }

  async updateManifest(originalKey, cacheKey, ctx) {
    try {
      // Track cache entries by tag for easy invalidation
      if (ctx.tags && Array.isArray(ctx.tags)) {
        const promises = ctx.tags.map(tag =>
          redis.sadd(`tag:${tag}`, cacheKey)
        );
        await Promise.all(promises);
      }

      // Track cache metrics
      await redis.hincrby('cache:metrics', 'total_entries', 1);
      await redis.hset('cache:metrics', 'last_updated', Date.now());
    } catch (error) {
      console.error('Failed to update manifest:', error);
    }
  }

  async getMetrics() {
    try {
      const metrics = await redis.hgetall('cache:metrics');
      const memoryStats = {
        size: memoryCache.size,
        calculatedSize: memoryCache.calculatedSize,
      };

      // Count file cache entries
      const files = await fs.readdir(CACHE_DIR);
      const fileCount = files.filter(f => f.endsWith('.json')).length;

      return {
        memory: memoryStats,
        redis: metrics,
        fileSystem: { count: fileCount },
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Failed to get metrics:', error);
      return null;
    }
  }

  async clear() {
    console.log('Clearing all caches');

    try {
      // Clear memory cache
      memoryCache.clear();

      // Clear Redis cache (pattern matching)
      const keys = await redis.keys('next:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }

      // Clear tag sets
      const tagKeys = await redis.keys('tag:*');
      if (tagKeys.length > 0) {
        await redis.del(...tagKeys);
      }

      // Clear file system cache
      const files = await fs.readdir(CACHE_DIR);
      const promises = files.map(file =>
        fs.unlink(path.join(CACHE_DIR, file)).catch(() => {})
      );
      await Promise.all(promises);

      // Reset metrics
      await redis.del('cache:metrics');

      console.log('All caches cleared successfully');
      return true;
    } catch (error) {
      console.error('Failed to clear caches:', error);
      return false;
    }
  }
}

// Export for Next.js
module.exports = CustomIncrementalCache;