/**
 * Multi-Layer Cache Manager
 * Coordinates between L1 (in-memory LRU) and L2 (Redis) caching layers
 * Provides automatic promotion, invalidation, and monitoring
 */

import { LRUCache, getGlobalLRUCache } from './lru-cache';
import * as redis from './redis';

export interface CacheOptions {
  ttl?: number;
  tags?: string[];
  skipL1?: boolean;
  skipL2?: boolean;
  promoteToL1?: boolean;
}

export interface CacheLayer {
  name: string;
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
  hitRate: number;
  missRate: number;
  avgLatency?: number;
}

export interface CacheMetrics {
  l1: CacheLayer;
  l2: CacheLayer;
  overall: {
    totalHits: number;
    totalMisses: number;
    overallHitRate: number;
    avgRetrievalTime: number;
  };
  timestamp: number;
}

class MultiLayerCache {
  private l1Cache: LRUCache;
  private metrics = {
    l1Latency: [] as number[],
    l2Latency: [] as number[],
    dbLatency: [] as number[],
  };

  constructor(l1Cache?: LRUCache) {
    this.l1Cache = l1Cache || getGlobalLRUCache();
  }

  /**
   * Get value from multi-layer cache
   * Checks L1 -> L2 -> Database (via loader)
   */
  async get<T>(
    key: string,
    options: CacheOptions & {
      loader?: () => Promise<T>;
    } = {}
  ): Promise<T | null> {
    const startTime = Date.now();

    // Check L1 cache first (unless skipped)
    if (!options.skipL1) {
      const l1Start = Date.now();
      const l1Value = this.l1Cache.get(key);
      this.recordLatency('l1', Date.now() - l1Start);

      if (l1Value !== null) {
        return l1Value as T;
      }
    }

    // Check L2 cache (Redis) unless skipped
    if (!options.skipL2) {
      const l2Start = Date.now();
      const l2Value = await redis.getCache<T>(key);
      this.recordLatency('l2', Date.now() - l2Start);

      if (l2Value !== null) {
        // Promote to L1 if requested
        if (options.promoteToL1 !== false && !options.skipL1) {
          this.l1Cache.set(key, l2Value, {
            ttl: options.ttl,
            tags: options.tags,
          });
        }
        return l2Value;
      }
    }

    // Load from database if loader provided
    if (options.loader) {
      const dbStart = Date.now();
      const value = await options.loader();
      this.recordLatency('db', Date.now() - dbStart);

      // Store in both layers
      await this.set(key, value, options);
      return value;
    }

    return null;
  }

  /**
   * Set value in multi-layer cache
   */
  async set<T>(
    key: string,
    value: T,
    options: CacheOptions = {}
  ): Promise<void> {
    const promises: Promise<void>[] = [];

    // Set in L1 unless skipped
    if (!options.skipL1) {
      this.l1Cache.set(key, value, {
        ttl: options.ttl,
        tags: options.tags,
      });
    }

    // Set in L2 unless skipped
    if (!options.skipL2) {
      promises.push(
        redis.setCache(key, value, options.ttl, options.tags)
      );
    }

    await Promise.all(promises);
  }

  /**
   * Delete from all cache layers
   */
  async delete(key: string): Promise<void> {
    // Delete from L1
    this.l1Cache.delete(key);

    // Delete from L2
    await redis.deleteCache(key);
  }

  /**
   * Delete by tag from all layers
   */
  async deleteByTag(tag: string): Promise<number> {
    // Delete from L1
    const l1Deleted = this.l1Cache.deleteByTag(tag);

    // Delete from L2
    const l2Deleted = await redis.deleteCacheByTag(tag);

    return l1Deleted + l2Deleted;
  }

  /**
   * Delete by pattern from all layers
   */
  async deleteByPattern(pattern: string): Promise<number> {
    // Delete from L1
    const l1Deleted = this.l1Cache.deleteByPattern(pattern);

    // Delete from L2
    await redis.deleteCacheByPattern(pattern);

    return l1Deleted;
  }

  /**
   * Batch get from multi-layer cache
   */
  async mget<T>(
    keys: string[],
    options: CacheOptions & {
      loader?: (missingKeys: string[]) => Promise<Map<string, T>>;
    } = {}
  ): Promise<Map<string, T | null>> {
    const result = new Map<string, T | null>();
    const missingFromL1: string[] = [];

    // Check L1 first
    if (!options.skipL1) {
      for (const key of keys) {
        const value = this.l1Cache.get(key);
        if (value !== null) {
          result.set(key, value as T);
        } else {
          missingFromL1.push(key);
        }
      }
    } else {
      missingFromL1.push(...keys);
    }

    if (missingFromL1.length === 0) {
      return result;
    }

    // Check L2 for missing keys
    const missingFromL2: string[] = [];
    if (!options.skipL2) {
      const l2Results = await redis.batchGetCache<T>(missingFromL1);

      for (const [key, value] of l2Results) {
        if (value !== null) {
          result.set(key, value);
          // Promote to L1
          if (options.promoteToL1 !== false && !options.skipL1) {
            this.l1Cache.set(key, value, {
              ttl: options.ttl,
              tags: options.tags,
            });
          }
        } else {
          missingFromL2.push(key);
        }
      }
    } else {
      missingFromL2.push(...missingFromL1);
    }

    // Load missing from database if loader provided
    if (missingFromL2.length > 0 && options.loader) {
      const loaded = await options.loader(missingFromL2);

      // Store loaded values
      const entries: Array<{
        key: string;
        value: T;
        ttl?: number;
        tags?: string[];
      }> = [];

      for (const [key, value] of loaded) {
        if (value !== null) {
          result.set(key, value);
          entries.push({
            key,
            value,
            ttl: options.ttl,
            tags: options.tags,
          });
        }
      }

      // Batch set in cache
      if (entries.length > 0) {
        await this.mset(entries, options);
      }
    }

    // Fill in nulls for any still missing
    for (const key of missingFromL2) {
      if (!result.has(key)) {
        result.set(key, null);
      }
    }

    return result;
  }

  /**
   * Batch set in multi-layer cache
   */
  async mset<T>(
    entries: Array<{
      key: string;
      value: T;
      ttl?: number;
      tags?: string[];
    }>,
    options: CacheOptions = {}
  ): Promise<void> {
    // Set in L1
    if (!options.skipL1) {
      this.l1Cache.mset(entries);
    }

    // Set in L2
    if (!options.skipL2) {
      await redis.batchSetCache(entries);
    }
  }

  /**
   * Check if key exists in any layer
   */
  async has(key: string): Promise<boolean> {
    // Check L1
    if (this.l1Cache.has(key)) {
      return true;
    }

    // Check L2
    return await redis.existsInCache(key);
  }

  /**
   * Clear all cache layers
   */
  async clear(): Promise<void> {
    // Clear L1
    this.l1Cache.clear();

    // Clear L2 (be careful with this in production!)
    if (process.env.NODE_ENV === 'development') {
      await redis.deleteCacheByPattern('*');
    }
  }

  /**
   * Warm cache with data
   */
  async warm<T>(
    loader: () => Promise<Array<{
      key: string;
      value: T;
      ttl?: number;
      tags?: string[];
    }>>,
    options: CacheOptions = {}
  ): Promise<number> {
    try {
      const entries = await loader();

      // Warm L1
      if (!options.skipL1) {
        this.l1Cache.mset(entries);
      }

      // Warm L2
      if (!options.skipL2) {
        await redis.batchSetCache(entries);
      }

      return entries.length;
    } catch (error) {
      console.error('Error warming cache:', error);
      return 0;
    }
  }

  /**
   * Get comprehensive cache metrics
   */
  getMetrics(): CacheMetrics {
    const l1Stats = this.l1Cache.getStats();
    const l2Stats = redis.getCacheStats();

    const totalHits = l1Stats.hits + l2Stats.hits;
    const totalMisses = l1Stats.misses + l2Stats.misses;
    const total = totalHits + totalMisses;

    return {
      l1: {
        name: 'LRU (Memory)',
        hits: l1Stats.hits,
        misses: l1Stats.misses,
        sets: 0, // Not tracked in LRU
        deletes: 0, // Not tracked in LRU
        errors: 0,
        hitRate: l1Stats.hitRate,
        missRate: l1Stats.missRate,
        avgLatency: this.getAvgLatency('l1'),
      },
      l2: {
        name: 'Redis',
        hits: l2Stats.hits,
        misses: l2Stats.misses,
        sets: l2Stats.sets,
        deletes: l2Stats.deletes,
        errors: l2Stats.errors,
        hitRate: l2Stats.hitRate,
        missRate: l2Stats.missRate,
        avgLatency: this.getAvgLatency('l2'),
      },
      overall: {
        totalHits,
        totalMisses,
        overallHitRate: total > 0 ? totalHits / total : 0,
        avgRetrievalTime: this.getOverallAvgLatency(),
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Reset metrics for all layers
   */
  resetMetrics(): void {
    this.l1Cache.resetStats();
    redis.resetCacheStats();
    this.metrics = {
      l1Latency: [],
      l2Latency: [],
      dbLatency: [],
    };
  }

  /**
   * Get cache size information
   */
  getSizeInfo() {
    return {
      l1: {
        itemCount: this.l1Cache.size(),
        memorySize: this.l1Cache.memorySize(),
      },
      l2: {
        // Redis doesn't easily provide size info without scanning
        itemCount: 'N/A',
        memorySize: 'N/A',
      },
    };
  }

  /**
   * Export metrics for monitoring
   */
  exportMetrics(): string {
    const metrics = this.getMetrics();
    const lines: string[] = [];

    // Prometheus-style metrics
    lines.push(`# HELP cache_hits_total Total number of cache hits`);
    lines.push(`# TYPE cache_hits_total counter`);
    lines.push(`cache_hits_total{layer="l1"} ${metrics.l1.hits}`);
    lines.push(`cache_hits_total{layer="l2"} ${metrics.l2.hits}`);

    lines.push(`# HELP cache_misses_total Total number of cache misses`);
    lines.push(`# TYPE cache_misses_total counter`);
    lines.push(`cache_misses_total{layer="l1"} ${metrics.l1.misses}`);
    lines.push(`cache_misses_total{layer="l2"} ${metrics.l2.misses}`);

    lines.push(`# HELP cache_hit_rate Cache hit rate`);
    lines.push(`# TYPE cache_hit_rate gauge`);
    lines.push(`cache_hit_rate{layer="l1"} ${metrics.l1.hitRate}`);
    lines.push(`cache_hit_rate{layer="l2"} ${metrics.l2.hitRate}`);
    lines.push(`cache_hit_rate{layer="overall"} ${metrics.overall.overallHitRate}`);

    if (metrics.l1.avgLatency) {
      lines.push(`# HELP cache_latency_ms Average cache latency in milliseconds`);
      lines.push(`# TYPE cache_latency_ms gauge`);
      lines.push(`cache_latency_ms{layer="l1"} ${metrics.l1.avgLatency}`);
    }
    if (metrics.l2.avgLatency) {
      lines.push(`cache_latency_ms{layer="l2"} ${metrics.l2.avgLatency}`);
    }

    return lines.join('\n');
  }

  // Private methods

  private recordLatency(layer: 'l1' | 'l2' | 'db', latency: number): void {
    const key = `${layer}Latency` as keyof typeof this.metrics;
    this.metrics[key].push(latency);

    // Keep only last 1000 measurements
    if (this.metrics[key].length > 1000) {
      this.metrics[key] = this.metrics[key].slice(-1000);
    }
  }

  private getAvgLatency(layer: 'l1' | 'l2' | 'db'): number | undefined {
    const key = `${layer}Latency` as keyof typeof this.metrics;
    const latencies = this.metrics[key];
    if (latencies.length === 0) return undefined;

    const sum = latencies.reduce((a, b) => a + b, 0);
    return sum / latencies.length;
  }

  private getOverallAvgLatency(): number {
    const allLatencies = [
      ...this.metrics.l1Latency,
      ...this.metrics.l2Latency,
      ...this.metrics.dbLatency,
    ];

    if (allLatencies.length === 0) return 0;

    const sum = allLatencies.reduce((a, b) => a + b, 0);
    return sum / allLatencies.length;
  }
}

// Singleton instance
let globalCache: MultiLayerCache | null = null;

export function getMultiLayerCache(): MultiLayerCache {
  if (!globalCache) {
    globalCache = new MultiLayerCache();
  }
  return globalCache;
}

export function destroyMultiLayerCache(): void {
  if (globalCache) {
    globalCache = null;
  }
}

export { MultiLayerCache };
export default MultiLayerCache;