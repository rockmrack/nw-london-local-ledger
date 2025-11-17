/**
 * API Cache Integration Examples
 * Shows how to use the multi-layer cache system in API routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMultiLayerCache } from './multi-layer-cache';
import { CacheTags } from './cache-tags';
import crypto from 'crypto';

/**
 * Generate cache key from request parameters
 */
export function generateCacheKey(
  prefix: string,
  params: Record<string, any>
): string {
  // Sort params for consistent key generation
  const sortedParams = Object.keys(params)
    .sort()
    .reduce((acc, key) => {
      if (params[key] !== undefined && params[key] !== null) {
        acc[key] = params[key];
      }
      return acc;
    }, {} as Record<string, any>);

  // Use hash for long keys
  const paramStr = JSON.stringify(sortedParams);
  if (paramStr.length > 100) {
    const hash = crypto.createHash('md5').update(paramStr).digest('hex');
    return `${prefix}:${hash}`;
  }

  return `${prefix}:${paramStr}`;
}

/**
 * Extract cache control headers from request
 */
export function getCacheControl(request: NextRequest): {
  noCache: boolean;
  noStore: boolean;
  maxAge?: number;
} {
  const cacheControl = request.headers.get('cache-control') || '';

  return {
    noCache: cacheControl.includes('no-cache'),
    noStore: cacheControl.includes('no-store'),
    maxAge: cacheControl.match(/max-age=(\d+)/)?.[1]
      ? parseInt(cacheControl.match(/max-age=(\d+)/)?.[1]!)
      : undefined,
  };
}

/**
 * Enhanced Properties API with Multi-Layer Cache
 */
export async function enhancedPropertiesAPI(request: NextRequest) {
  const cache = getMultiLayerCache();
  const searchParams = request.nextUrl.searchParams;

  // Parse parameters
  const params = {
    postcode: searchParams.get('postcode'),
    area: searchParams.get('area'),
    propertyType: searchParams.get('propertyType'),
    minPrice: searchParams.get('minPrice'),
    maxPrice: searchParams.get('maxPrice'),
    minBedrooms: searchParams.get('minBedrooms'),
    maxBedrooms: searchParams.get('maxBedrooms'),
    page: searchParams.get('page') || '1',
    limit: searchParams.get('limit') || '20',
  };

  // Check cache control headers
  const cacheControl = getCacheControl(request);
  const skipCache = cacheControl.noCache || cacheControl.noStore;

  // Generate cache key and tags
  const cacheKey = generateCacheKey('api:properties:search', params);
  const tags: string[] = [
    CacheTags.apiEndpoint('/api/properties'),
    ...CacheTags.currentTimeTags(),
  ];

  // Add specific tags based on parameters
  if (params.postcode) {
    tags.push(CacheTags.propertyPostcode(params.postcode));
  }
  if (params.area) {
    tags.push(CacheTags.propertyArea(params.area));
  }
  if (params.propertyType) {
    tags.push(CacheTags.propertyType(params.propertyType));
  }

  try {
    // Get from cache with loader function
    const result = await cache.get(cacheKey, {
      skipL1: skipCache,
      skipL2: skipCache,
      ttl: cacheControl.maxAge || 300, // 5 minutes default
      tags,
      loader: async () => {
        // This is the actual data loading logic
        // Replace with your actual service call
        const { propertyService } = await import('@/services/property/PropertyService');
        return await propertyService.searchProperties(params);
      },
    });

    // Add cache headers to response
    const response = NextResponse.json(result);
    response.headers.set('X-Cache', result ? 'HIT' : 'MISS');
    response.headers.set('Cache-Control', `public, max-age=${cacheControl.maxAge || 300}`);

    return response;
  } catch (error) {
    console.error('Error in properties API:', error);
    return NextResponse.json(
      { error: 'Failed to fetch properties' },
      { status: 500 }
    );
  }
}

/**
 * Enhanced Planning Applications API with Batch Operations
 */
export async function enhancedPlanningAPI(request: NextRequest) {
  const cache = getMultiLayerCache();
  const searchParams = request.nextUrl.searchParams;

  // Check if batch request
  const ids = searchParams.get('ids')?.split(',') || [];

  if (ids.length > 0) {
    // Batch get for multiple planning applications
    const keys = ids.map(id => `api:planning:${id}`);

    const results = await cache.mget(keys, {
      ttl: 3600, // 1 hour
      tags: ids.map(id => CacheTags.planning(id)),
      loader: async (missingKeys) => {
        // Load missing planning applications
        const missingIds = missingKeys.map(key => key.replace('api:planning:', ''));
        const { planningService } = await import('@/services/planning/PlanningService');

        const applications = await planningService.getByIds(missingIds);

        const resultMap = new Map();
        applications.forEach(app => {
          resultMap.set(`api:planning:${app.id}`, app);
        });

        return resultMap;
      },
    });

    return NextResponse.json(Array.from(results.values()));
  }

  // Single request with council filtering
  const council = searchParams.get('council');
  const status = searchParams.get('status');

  const cacheKey = generateCacheKey('api:planning:list', { council, status });
  const tags = [
    CacheTags.apiEndpoint('/api/planning'),
    ...(council ? [CacheTags.planningCouncil(council)] : []),
    ...(status ? [CacheTags.planningStatus(status)] : []),
  ];

  const result = await cache.get(cacheKey, {
    ttl: 1800, // 30 minutes
    tags,
    loader: async () => {
      const { planningService } = await import('@/services/planning/PlanningService');
      return await planningService.search({ council, status });
    },
  });

  return NextResponse.json(result);
}

/**
 * Enhanced Areas API with Cache Warming
 */
export async function enhancedAreasAPI(request: NextRequest) {
  const cache = getMultiLayerCache();
  const { pathname } = request.nextUrl;
  const slug = pathname.split('/').pop();

  if (!slug) {
    return NextResponse.json(
      { error: 'Area slug required' },
      { status: 400 }
    );
  }

  const cacheKey = `api:area:${slug}`;
  const tags = [
    CacheTags.apiEndpoint('/api/areas'),
    CacheTags.propertyArea(slug),
  ];

  // Get comprehensive area data with multi-layer cache
  const areaData = await cache.get(cacheKey, {
    ttl: 7200, // 2 hours
    tags,
    promoteToL1: true, // Ensure popular areas stay in L1
    loader: async () => {
      // Load area data with all related information
      const [properties, planning, schools, demographics, crime] = await Promise.all([
        // Property stats
        import('@/services/property/PropertyService').then(m =>
          m.propertyService.getAreaStats(slug)
        ),
        // Planning applications
        import('@/services/planning/PlanningService').then(m =>
          m.planningService.getByArea(slug)
        ),
        // Schools
        import('@/services/school/SchoolService').then(m =>
          m.schoolService.getByArea(slug)
        ),
        // Demographics
        import('@/services/demographics/DemographicsService').then(m =>
          m.demographicsService.getByArea(slug)
        ),
        // Crime stats
        import('@/services/crime/CrimeService').then(m =>
          m.crimeService.getAreaStats(slug)
        ),
      ]);

      return {
        area: slug,
        properties,
        planning,
        schools,
        demographics,
        crime,
        generatedAt: new Date().toISOString(),
      };
    },
  });

  // Set appropriate cache headers
  const response = NextResponse.json(areaData);
  response.headers.set('Cache-Control', 'public, max-age=7200, s-maxage=3600');
  response.headers.set('Vary', 'Accept-Encoding');

  return response;
}

/**
 * Cache Invalidation API
 */
export async function cacheInvalidationAPI(request: NextRequest) {
  if (request.method !== 'POST' && request.method !== 'DELETE') {
    return NextResponse.json(
      { error: 'Method not allowed' },
      { status: 405 }
    );
  }

  const cache = getMultiLayerCache();
  const body = await request.json();

  try {
    let deleted = 0;

    if (body.tags) {
      // Invalidate by tags
      for (const tag of body.tags) {
        deleted += await cache.deleteByTag(tag);
      }
    } else if (body.pattern) {
      // Invalidate by pattern
      deleted = await cache.deleteByPattern(body.pattern);
    } else if (body.keys) {
      // Invalidate specific keys
      for (const key of body.keys) {
        await cache.delete(key);
        deleted++;
      }
    } else if (body.type && body.id) {
      // Smart invalidation based on entity type
      const { CacheInvalidation } = await import('./cache-tags');
      deleted = await CacheInvalidation.smartInvalidate(
        body.type,
        { id: body.id, ...body.data },
        cache
      );
    } else {
      return NextResponse.json(
        { error: 'Invalid invalidation request' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      deleted,
      message: `Successfully invalidated ${deleted} cache entries`,
    });
  } catch (error) {
    console.error('Cache invalidation error:', error);
    return NextResponse.json(
      { error: 'Failed to invalidate cache' },
      { status: 500 }
    );
  }
}

/**
 * Cache Metrics API
 */
export async function cacheMetricsAPI(request: NextRequest) {
  const cache = getMultiLayerCache();

  const format = request.nextUrl.searchParams.get('format');
  const metrics = cache.getMetrics();
  const sizeInfo = cache.getSizeInfo();

  const response = {
    metrics,
    size: sizeInfo,
    timestamp: new Date().toISOString(),
  };

  if (format === 'prometheus') {
    // Return Prometheus format metrics
    return new NextResponse(cache.exportMetrics(), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }

  return NextResponse.json(response);
}

/**
 * Cache Warming API
 */
export async function cacheWarmingAPI(request: NextRequest) {
  if (request.method !== 'POST') {
    return NextResponse.json(
      { error: 'Method not allowed' },
      { status: 405 }
    );
  }

  const body = await request.json();
  const { strategies, immediate } = body;

  if (immediate) {
    // Immediate warming (blocking)
    const { CacheWarmer } = await import('./cache-warmer');
    const warmer = new CacheWarmer();

    if (strategies?.length > 0) {
      // Warm specific strategies
      for (const strategy of strategies) {
        await warmer['executeStrategy']({
          name: strategy,
          enabled: true,
          priority: 1
        });
      }
    } else {
      // Warm all
      await warmer.warmAll();
    }

    const stats = warmer.getStats();
    return NextResponse.json({
      success: true,
      stats,
    });
  } else {
    // Queue warming job (non-blocking)
    const { QueueService } = await import('@/lib/queues/services/queue.service');
    const queueService = QueueService.getInstance();

    const jobId = await queueService.addJob('cache', 'warm', {
      strategies,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      jobId,
      message: 'Cache warming job queued',
    });
  }
}

/**
 * Middleware for automatic cache headers
 */
export function withCacheHeaders(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const response = await handler(req);

    // Add standard cache headers if not already set
    if (!response.headers.has('Cache-Control')) {
      response.headers.set('Cache-Control', 'public, max-age=60, s-maxage=300');
    }

    // Add timing header
    response.headers.set('X-Response-Time', Date.now().toString());

    return response;
  };
}

export default {
  generateCacheKey,
  getCacheControl,
  enhancedPropertiesAPI,
  enhancedPlanningAPI,
  enhancedAreasAPI,
  cacheInvalidationAPI,
  cacheMetricsAPI,
  cacheWarmingAPI,
  withCacheHeaders,
};