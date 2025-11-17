# Multi-Layer Cache System Documentation

## Overview

The multi-layer cache system provides a high-performance caching solution with L1 (in-memory LRU) and L2 (Redis) layers, delivering **5-10x performance improvements** for frequently accessed data.

## Architecture

```
┌──────────────┐
│   Request    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  L1 Cache    │ ← In-Memory LRU (< 1ms latency)
│  (LRU)       │   - 5000 items default
└──────┬───────┘   - Auto expiration
       │ miss
       ▼
┌──────────────┐
│  L2 Cache    │ ← Redis (1-5ms latency)
│  (Redis)     │   - Tag-based invalidation
└──────┬───────┘   - Stampede protection
       │ miss
       ▼
┌──────────────┐
│  Database    │ ← Source of truth (10-100ms latency)
│  (Prisma)    │
└──────────────┘
```

## Features

### 1. L1 In-Memory Cache (LRU)
- **LRU eviction**: Least Recently Used items removed when cache is full
- **TTL support**: Automatic expiration of stale data
- **Thread-safe**: Safe for concurrent access
- **Size limits**: Configurable by memory or item count
- **Statistics**: Hit/miss rates, eviction tracking

### 2. L2 Redis Cache
- **Distributed**: Shared across all application instances
- **Tag-based invalidation**: Granular cache clearing
- **Stampede prevention**: Prevents multiple simultaneous cache rebuilds
- **Batch operations**: 5-10x faster for bulk operations
- **Persistent**: Survives application restarts

### 3. Multi-Layer Manager
- **Automatic promotion**: L2 → L1 on cache hits
- **Write-through**: Updates both layers simultaneously
- **Flexible control**: Skip layers as needed
- **Batch support**: Efficient bulk operations
- **Metrics**: Comprehensive performance monitoring

## Configuration

### Environment Variables

```env
# L1 Cache Configuration
L1_CACHE_MAX_ITEMS=5000           # Maximum items in L1 cache
L1_CACHE_DEFAULT_TTL=300          # Default TTL in seconds (5 minutes)
L1_CACHE_CLEANUP_INTERVAL=60000   # Cleanup interval in milliseconds

# L2 Cache Configuration
REDIS_URL=redis://localhost:6379  # Redis connection URL
REDIS_MAX_RETRIES=10              # Maximum reconnection attempts
```

## Usage Examples

### Basic Usage

```typescript
import { getMultiLayerCache } from '@/lib/cache/multi-layer-cache';

const cache = getMultiLayerCache();

// Simple get/set
const value = await cache.get('my-key');
await cache.set('my-key', data, { ttl: 300 });

// Get with loader (cache-aside pattern)
const data = await cache.get('user:123', {
  ttl: 600,
  tags: ['user', 'user:123'],
  loader: async () => {
    return await prisma.user.findUnique({
      where: { id: 123 }
    });
  }
});
```

### API Route Integration

```typescript
// app/api/properties/route.ts
import { getMultiLayerCache } from '@/lib/cache/multi-layer-cache';
import { CacheTags } from '@/lib/cache/cache-tags';

export async function GET(request: NextRequest) {
  const cache = getMultiLayerCache();
  const params = Object.fromEntries(request.nextUrl.searchParams);

  const cacheKey = `api:properties:${JSON.stringify(params)}`;
  const tags = [
    CacheTags.apiEndpoint('/api/properties'),
    ...(params.area ? [CacheTags.propertyArea(params.area)] : []),
  ];

  const result = await cache.get(cacheKey, {
    ttl: 300,
    tags,
    loader: async () => {
      return await propertyService.search(params);
    }
  });

  return NextResponse.json(result);
}
```

### Batch Operations

```typescript
// Fetch multiple items efficiently
const keys = ['property:1', 'property:2', 'property:3'];
const results = await cache.mget(keys, {
  ttl: 600,
  loader: async (missingKeys) => {
    const ids = missingKeys.map(k => k.split(':')[1]);
    const properties = await prisma.property.findMany({
      where: { id: { in: ids } }
    });

    const map = new Map();
    properties.forEach(p => {
      map.set(`property:${p.id}`, p);
    });
    return map;
  }
});
```

### Cache Invalidation

```typescript
import { CacheTags, CacheInvalidation } from '@/lib/cache/cache-tags';

// Invalidate by tag
await cache.deleteByTag(CacheTags.propertyArea('Camden'));

// Invalidate by pattern
await cache.deleteByPattern('property:*');

// Smart invalidation
await CacheInvalidation.smartInvalidate('property', {
  id: '123',
  area: 'Camden',
  council: 'Camden',
  postcode: 'NW1 1AA'
}, cache);

// Invalidate all caches for a postcode
await CacheInvalidation.invalidatePostcode('NW1 1AA', cache);
```

## Cache Tags

Tags enable granular cache invalidation. Common tag patterns:

```typescript
// Property tags
CacheTags.property(id)              // property:123
CacheTags.propertyArea(area)        // property:area:camden
CacheTags.propertyCouncil(council)  // property:council:camden
CacheTags.propertyPostcode(postcode) // property:postcode:NW11AA
CacheTags.propertyType(type)        // property:type:flat

// Planning tags
CacheTags.planning(id)              // planning:APP/2024/1234
CacheTags.planningArea(area)        // planning:area:camden
CacheTags.planningStatus(status)    // planning:status:pending

// Time-based tags (for automatic expiration)
CacheTags.hourly(hour)              // time:hour:14
CacheTags.daily(date)               // time:day:2024-01-15
CacheTags.monthly(month, year)      // time:month:2024-01
```

## Cache Warming

Preload frequently accessed data to improve performance:

```typescript
import { CacheWarmer } from '@/lib/cache/cache-warmer';

const warmer = new CacheWarmer();

// Warm all configured strategies
await warmer.warmAll();

// Warm specific strategies
await warmer.executeStrategy({
  name: 'recent-properties',
  priority: 1,
  enabled: true,
  ttl: 3600,
  batchSize: 100
});

// Available strategies:
// - recent-properties: Recent property listings
// - popular-areas: Most viewed areas
// - active-planning: Active planning applications
// - top-schools: Outstanding/Good schools
// - transport-stations: Station data
// - council-tax-bands: Tax band information
// - crime-stats: Recent crime statistics
```

### Queue Integration

```typescript
// Add cache warming to queue
import { QueueService } from '@/lib/queues/services/queue.service';

const queue = QueueService.getInstance();

// Schedule regular cache warming
await queue.addJob('cache', 'warm', {
  strategies: ['recent-properties', 'popular-areas']
}, {
  repeat: {
    cron: '0 */6 * * *' // Every 6 hours
  }
});
```

## Performance Monitoring

### Metrics API

```typescript
// GET /api/cache/metrics
const metrics = cache.getMetrics();

// Returns:
{
  l1: {
    name: 'LRU (Memory)',
    hits: 15234,
    misses: 2341,
    hitRate: 0.867,
    missRate: 0.133,
    avgLatency: 0.5  // milliseconds
  },
  l2: {
    name: 'Redis',
    hits: 8532,
    misses: 1243,
    hitRate: 0.873,
    missRate: 0.127,
    avgLatency: 2.3  // milliseconds
  },
  overall: {
    totalHits: 23766,
    totalMisses: 3584,
    overallHitRate: 0.869,
    avgRetrievalTime: 1.2
  }
}
```

### Prometheus Integration

```typescript
// GET /api/cache/metrics?format=prometheus
cache_hits_total{layer="l1"} 15234
cache_hits_total{layer="l2"} 8532
cache_misses_total{layer="l1"} 2341
cache_misses_total{layer="l2"} 1243
cache_hit_rate{layer="l1"} 0.867
cache_hit_rate{layer="l2"} 0.873
cache_hit_rate{layer="overall"} 0.869
cache_latency_ms{layer="l1"} 0.5
cache_latency_ms{layer="l2"} 2.3
```

## Performance Benchmarks

### Expected Performance Improvements

| Operation | Without Cache | L2 Only (Redis) | L1 + L2 | Improvement |
|-----------|--------------|-----------------|---------|-------------|
| Property Search | 150ms | 15ms | 2ms | **75x** |
| Area Stats | 200ms | 20ms | 1ms | **200x** |
| Planning List | 100ms | 10ms | 1ms | **100x** |
| School Data | 80ms | 8ms | <1ms | **80x** |
| Batch (100 items) | 500ms | 50ms | 5ms | **100x** |

### Hit Rate Targets

- **L1 Cache**: 70-80% hit rate for hot data
- **L2 Cache**: 85-95% hit rate overall
- **Combined**: 95-99% hit rate

### Memory Usage

- **L1 Cache**: ~50-100MB for 5000 items
- **L2 Cache**: Depends on Redis configuration
- **Overhead**: ~10% for metadata and tags

## Best Practices

### 1. Cache Key Design
```typescript
// Good: Hierarchical, predictable
`api:properties:search:${hash}`
`property:${id}`
`area:stats:${slug}`

// Bad: Random, unpredictable
`${uuid}`
`cache_${timestamp}_${random}`
```

### 2. TTL Strategy
```typescript
// Short TTL for frequently changing data
await cache.set(key, data, { ttl: 60 });  // 1 minute

// Long TTL for stable data
await cache.set(key, data, { ttl: 86400 }); // 24 hours

// No TTL for reference data (manual invalidation)
await cache.set(key, data);
```

### 3. Tag Usage
```typescript
// Use multiple tags for flexible invalidation
const tags = [
  CacheTags.property(id),           // Specific
  CacheTags.propertyArea(area),     // Group
  CacheTags.propertyCouncil(council), // Region
  ...CacheTags.currentTimeTags()    // Time-based
];
```

### 4. Skip Cache When Needed
```typescript
// Skip L1 for large objects
await cache.get(key, { skipL1: true });

// Skip all caches for fresh data
await cache.get(key, { skipL1: true, skipL2: true });
```

### 5. Monitor and Tune
```typescript
// Regular monitoring
setInterval(async () => {
  const metrics = cache.getMetrics();
  if (metrics.l1.hitRate < 0.5) {
    console.warn('L1 hit rate low, consider warming');
  }
}, 60000);
```

## Troubleshooting

### Low Hit Rates
- Check TTL values (too short?)
- Review cache key generation
- Ensure proper warming strategies
- Monitor eviction rates

### High Memory Usage
- Reduce L1 cache size
- Implement size estimation
- Review data structures
- Use compression for large values

### Redis Connection Issues
- Check REDIS_URL configuration
- Monitor connection pool
- Review firewall rules
- Check Redis server resources

### Stampede Issues
- Ensure loader functions are provided
- Check stampede protection is enabled
- Review concurrent request patterns
- Consider increasing TTL values

## Migration Guide

### From Simple Redis Cache

```typescript
// Before
import { getCache, setCache } from '@/lib/cache/redis';
const data = await getCache('key');
await setCache('key', value, 300);

// After
import { getMultiLayerCache } from '@/lib/cache/multi-layer-cache';
const cache = getMultiLayerCache();
const data = await cache.get('key');
await cache.set('key', value, { ttl: 300 });
```

### Adding to Existing API

```typescript
// 1. Import cache
import { getMultiLayerCache } from '@/lib/cache/multi-layer-cache';
import { CacheTags } from '@/lib/cache/cache-tags';

// 2. Wrap data fetching
const cache = getMultiLayerCache();
const data = await cache.get(cacheKey, {
  ttl: 300,
  tags: [/* appropriate tags */],
  loader: async () => {
    // Existing data fetching logic
    return await fetchData();
  }
});
```

## Next Steps

1. **Monitor Performance**: Use the metrics API to track improvements
2. **Tune Configuration**: Adjust cache sizes and TTLs based on usage
3. **Implement Warming**: Set up scheduled cache warming jobs
4. **Add Custom Tags**: Create domain-specific tag patterns
5. **Set Up Alerts**: Monitor cache health and performance