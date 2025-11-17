/**
 * Multi-Layer Cache Usage Examples
 * Demonstrates various caching patterns and best practices
 */

import {
  getMultiLayerCache,
  CacheTags,
  CacheInvalidation,
  CacheWarmer,
  cacheUtils,
} from '@/lib/cache';

// ============================================
// 1. BASIC USAGE
// ============================================

async function basicCacheUsage() {
  const cache = getMultiLayerCache();

  // Simple get/set
  await cache.set('user:123', { id: 123, name: 'John Doe' }, {
    ttl: 600, // 10 minutes
    tags: ['user', 'user:123'],
  });

  const user = await cache.get('user:123');
  console.log('User:', user);

  // Get with loader (cache-aside pattern)
  const property = await cache.get('property:456', {
    ttl: 1800, // 30 minutes
    tags: CacheTags.forProperty({
      id: '456',
      area: 'Camden',
      postcode: 'NW1 1AA',
    }),
    loader: async () => {
      // This only runs if cache miss
      return await fetchPropertyFromDB('456');
    },
  });
}

// ============================================
// 2. API ROUTE WITH CACHING
// ============================================

import { NextRequest, NextResponse } from 'next/server';

export async function cachedAPIRoute(request: NextRequest) {
  const cache = getMultiLayerCache();
  const params = Object.fromEntries(request.nextUrl.searchParams);

  // Generate cache key
  const cacheKey = cacheUtils.generateKey('api:search', params);

  // Determine cache strategy
  const strategy = cacheUtils.getCacheStrategy(request);

  // Get tags for invalidation
  const tags = [
    CacheTags.apiEndpoint('/api/search'),
    ...(params.area ? [CacheTags.propertyArea(params.area)] : []),
    ...CacheTags.currentTimeTags(),
  ];

  // Fetch with caching
  const results = await cache.get(cacheKey, {
    ...strategy,
    ttl: cacheUtils.calculateTTL('search'),
    tags,
    loader: async () => {
      return await performSearch(params);
    },
  });

  const response = NextResponse.json(results);
  response.headers.set('X-Cache', results ? 'HIT' : 'MISS');
  return response;
}

// ============================================
// 3. BATCH OPERATIONS
// ============================================

async function batchCacheOperations() {
  const cache = getMultiLayerCache();

  // Batch get with loader
  const propertyIds = ['123', '456', '789'];
  const keys = propertyIds.map(id => `property:${id}`);

  const properties = await cache.mget(keys, {
    ttl: 1800,
    loader: async (missingKeys) => {
      // Only load missing properties
      const missingIds = missingKeys.map(k => k.split(':')[1]);
      const loadedProperties = await fetchPropertiesFromDB(missingIds);

      const map = new Map();
      loadedProperties.forEach(prop => {
        map.set(`property:${prop.id}`, prop);
      });
      return map;
    },
  });

  // Batch set
  const propertiesToCache = [
    { key: 'property:001', value: { id: '001', price: 500000 }, ttl: 1800 },
    { key: 'property:002', value: { id: '002', price: 750000 }, ttl: 1800 },
  ];

  await cache.mset(propertiesToCache);
}

// ============================================
// 4. CACHE INVALIDATION
// ============================================

async function cacheInvalidationExamples() {
  const cache = getMultiLayerCache();

  // Invalidate by tag
  await cache.deleteByTag(CacheTags.propertyArea('Camden'));

  // Invalidate by pattern
  await cache.deleteByPattern('search:*');

  // Smart invalidation for entity update
  await CacheInvalidation.smartInvalidate('property', {
    id: '123',
    area: 'Camden',
    council: 'Camden',
    postcode: 'NW1 1AA',
  }, cache);

  // Invalidate all caches for a postcode
  await CacheInvalidation.invalidatePostcode('NW1 1AA', cache);

  // Time-based invalidation
  await CacheInvalidation.invalidateHourly(cache);
}

// ============================================
// 5. CACHE WARMING
// ============================================

async function cacheWarmingExamples() {
  const warmer = new CacheWarmer();

  // Warm all configured strategies
  await warmer.warmAll();

  // Get warming statistics
  const stats = warmer.getStats();
  console.log('Warming stats:', stats);

  // Custom warming strategy
  const cache = getMultiLayerCache();
  await cache.warm(async () => {
    // Load frequently accessed data
    const popularProperties = await fetchPopularProperties();

    return popularProperties.map(prop => ({
      key: `property:${prop.id}`,
      value: prop,
      ttl: 3600,
      tags: CacheTags.forProperty(prop),
    }));
  });
}

// ============================================
// 6. MONITORING AND METRICS
// ============================================

async function monitoringExamples() {
  const cache = getMultiLayerCache();

  // Get comprehensive metrics
  const metrics = cache.getMetrics();

  console.log('Cache Performance:', {
    l1HitRate: `${(metrics.l1.hitRate * 100).toFixed(1)}%`,
    l2HitRate: `${(metrics.l2.hitRate * 100).toFixed(1)}%`,
    overallHitRate: `${(metrics.overall.overallHitRate * 100).toFixed(1)}%`,
    avgRetrievalTime: `${metrics.overall.avgRetrievalTime.toFixed(2)}ms`,
  });

  // Export Prometheus metrics
  const prometheusMetrics = cache.exportMetrics();
  console.log(prometheusMetrics);

  // Check cache health
  if (metrics.l1.hitRate < 0.5) {
    console.warn('L1 cache hit rate is low, consider warming');
  }

  if (metrics.l2.errors > 100) {
    console.error('High error rate in L2 cache, check Redis connection');
  }
}

// ============================================
// 7. ADVANCED PATTERNS
// ============================================

async function advancedPatterns() {
  const cache = getMultiLayerCache();

  // 1. Stampede protection with custom loader
  const expensiveData = await cache.get('expensive:computation', {
    ttl: 3600,
    loader: async () => {
      // This will only run once even with concurrent requests
      return await performExpensiveComputation();
    },
  });

  // 2. Skip L1 for large objects
  const largeDataset = await cache.get('large:dataset', {
    skipL1: true, // Only use Redis
    ttl: 7200,
    loader: async () => await fetchLargeDataset(),
  });

  // 3. Force fresh data (skip all caches)
  const freshData = await cache.get('critical:data', {
    skipL1: true,
    skipL2: true,
    loader: async () => await fetchCriticalData(),
  });

  // 4. Conditional caching based on result
  const searchResults = await performSearch({ query: 'test' });

  if (searchResults.length > 0) {
    // Only cache if results found
    await cache.set('search:test', searchResults, {
      ttl: 300,
      tags: [CacheTags.search('test')],
    });
  }

  // 5. Cache with dynamic TTL based on time of day
  const hour = new Date().getHours();
  const ttl = hour >= 9 && hour <= 17 ? 300 : 1800; // Shorter TTL during business hours

  await cache.set('dynamic:data', data, { ttl });
}

// ============================================
// 8. ERROR HANDLING
// ============================================

async function errorHandlingExamples() {
  const cache = getMultiLayerCache();

  try {
    const data = await cache.get('key', {
      loader: async () => {
        // Always provide fallback in loader
        try {
          return await riskyOperation();
        } catch (error) {
          console.error('Loader failed:', error);
          return null; // Return null or default value
        }
      },
    });

    // Handle null response
    if (!data) {
      return { error: 'Data not available' };
    }

    return data;
  } catch (error) {
    // Cache operations should rarely throw
    console.error('Cache error:', error);

    // Fallback to direct database query
    return await fetchDirectlyFromDB();
  }
}

// ============================================
// HELPER FUNCTIONS (Mock implementations)
// ============================================

async function fetchPropertyFromDB(id: string) {
  // Mock database fetch
  return { id, price: 500000, area: 'Camden' };
}

async function performSearch(params: any) {
  // Mock search operation
  return [{ id: '1', title: 'Result 1' }];
}

async function fetchPropertiesFromDB(ids: string[]) {
  // Mock batch fetch
  return ids.map(id => ({ id, price: Math.random() * 1000000 }));
}

async function fetchPopularProperties() {
  // Mock popular properties
  return [
    { id: '1', area: 'Camden', council: 'Camden', postcode: 'NW1 1AA' },
    { id: '2', area: 'Westminster', council: 'Westminster', postcode: 'W1 1AA' },
  ];
}

async function performExpensiveComputation() {
  // Mock expensive operation
  await new Promise(resolve => setTimeout(resolve, 1000));
  return { computed: true, timestamp: Date.now() };
}

async function fetchLargeDataset() {
  // Mock large dataset
  return new Array(10000).fill(null).map((_, i) => ({ id: i, data: 'large' }));
}

async function fetchCriticalData() {
  // Mock critical data fetch
  return { critical: true, realtime: Date.now() };
}

async function riskyOperation() {
  // Mock risky operation that might fail
  if (Math.random() > 0.5) {
    throw new Error('Operation failed');
  }
  return { success: true };
}

async function fetchDirectlyFromDB() {
  // Mock direct DB access
  return { fallback: true, source: 'database' };
}

// ============================================
// EXPORT ALL EXAMPLES
// ============================================

export default {
  basicCacheUsage,
  cachedAPIRoute,
  batchCacheOperations,
  cacheInvalidationExamples,
  cacheWarmingExamples,
  monitoringExamples,
  advancedPatterns,
  errorHandlingExamples,
};