/**
 * Cache System Exports
 * Central export point for all cache-related functionality
 */

// Core cache implementations
export { LRUCache, getGlobalLRUCache, destroyGlobalLRUCache } from './lru-cache';
export * from './redis';
export {
  MultiLayerCache,
  getMultiLayerCache,
  destroyMultiLayerCache,
  type CacheOptions,
  type CacheLayer,
  type CacheMetrics,
} from './multi-layer-cache';

// Cache tagging and invalidation
export { CacheTags, CacheInvalidation } from './cache-tags';

// Cache warming
export { CacheWarmer, handleCacheWarmingJob } from './cache-warmer';

// API helpers
export {
  generateCacheKey,
  getCacheControl,
  enhancedPropertiesAPI,
  enhancedPlanningAPI,
  enhancedAreasAPI,
  cacheInvalidationAPI,
  cacheMetricsAPI,
  cacheWarmingAPI,
  withCacheHeaders,
} from './api-cache-examples';

// Utility functions
export const cacheUtils = {
  /**
   * Generate a consistent cache key from parameters
   */
  generateKey: (prefix: string, params: any): string => {
    const sorted = Object.keys(params)
      .sort()
      .reduce((acc, key) => {
        if (params[key] !== undefined && params[key] !== null) {
          acc[key] = params[key];
        }
        return acc;
      }, {} as any);

    return `${prefix}:${JSON.stringify(sorted)}`;
  },

  /**
   * Calculate optimal TTL based on data type
   */
  calculateTTL: (dataType: string): number => {
    const ttlMap: Record<string, number> = {
      property: 1800,      // 30 minutes
      planning: 3600,      // 1 hour
      school: 86400,       // 24 hours
      transport: 86400,    // 24 hours
      demographics: 86400, // 24 hours
      crime: 3600,        // 1 hour
      search: 300,        // 5 minutes
      user: 600,          // 10 minutes
      default: 600,       // 10 minutes
    };

    return ttlMap[dataType] || ttlMap.default;
  },

  /**
   * Determine cache strategy based on request
   */
  getCacheStrategy: (request: any): CacheOptions => {
    const userAgent = request.headers.get('user-agent') || '';
    const isBot = /bot|crawler|spider/i.test(userAgent);
    const isPrefetch = request.headers.get('purpose') === 'prefetch';

    return {
      skipL1: isBot,           // Bots skip L1 to save memory
      promoteToL1: !isPrefetch, // Don't promote prefetch to L1
      ttl: isBot ? 3600 : 600,  // Longer TTL for bots
    };
  },
};

// Type exports for better TypeScript support
export type CacheKey = string;
export type CacheValue = any;
export type CacheTTL = number;
export type CacheTag = string;

export interface CacheConfig {
  l1MaxItems?: number;
  l1DefaultTTL?: number;
  redisUrl?: string;
  enableMetrics?: boolean;
  enableWarming?: boolean;
}

// Default configuration
export const defaultCacheConfig: CacheConfig = {
  l1MaxItems: 5000,
  l1DefaultTTL: 300,
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  enableMetrics: true,
  enableWarming: true,
};

// Performance constants
export const CACHE_PERFORMANCE = {
  L1_LATENCY: '<1ms',
  L2_LATENCY: '1-5ms',
  DB_LATENCY: '10-100ms',
  EXPECTED_HIT_RATE: 0.95,
  EXPECTED_IMPROVEMENT: '5-10x',
} as const;