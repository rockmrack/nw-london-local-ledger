/**
 * Integration Examples for Request Deduplication and Edge Caching
 * Shows how to use both optimization layers together
 */

import { NextRequest, NextResponse } from 'next/server';
import { withDeduplication } from './middleware';
import { getGlobalDeduplicator } from './index';
import { getMultiLayerCache } from '../cache';

// ============================================
// 1. Next.js API Route with Deduplication
// ============================================

export const propertyAPIWithDeduplication = withDeduplication(
  async (req: NextRequest) => {
    const url = new URL(req.url);
    const propertyId = url.searchParams.get('id');

    // This will be deduplicated - multiple concurrent requests
    // for the same property will only hit the database once
    const property = await fetchPropertyFromDatabase(propertyId!);

    return NextResponse.json(property, {
      headers: {
        // These headers will be used by Cloudflare Workers
        'Cache-Control': 'public, max-age=180, stale-while-revalidate=3600',
        'CDN-Cache-Control': 'max-age=1800',
        'Cache-Tag': `property,property-${propertyId}`,
      },
    });
  },
  {
    ttl: 5000,
    enableMetrics: true,
    includePaths: ['/api/properties'],
  }
);

// ============================================
// 2. GraphQL with Deduplication
// ============================================

import { createGraphQLDeduplicationMiddleware } from './middleware';

// Apply to GraphQL server
export const graphqlDeduplicationMiddleware = createGraphQLDeduplicationMiddleware({
  graphqlPath: '/api/graphql',
  ttl: 10000,
  enableMetrics: true,
});

// ============================================
// 3. Combined Deduplication + Multi-Layer Cache
// ============================================

export async function optimizedDataFetch(
  dataType: 'property' | 'planning' | 'area',
  id: string
) {
  const deduplicator = getGlobalDeduplicator();
  const cache = getMultiLayerCache();

  // Generate cache key
  const cacheKey = `${dataType}:${id}`;

  // First check cache (L1 -> L2 -> DB)
  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // If not in cache, deduplicate the database fetch
  const data = await deduplicator.execute(
    { type: dataType, id },
    async () => {
      // This function will only run once even if called multiple times
      const result = await fetchFromDatabase(dataType, id);

      // Store in cache for future requests
      await cache.set(cacheKey, result, {
        ttl: dataType === 'area' ? 86400 : 3600,
        tags: [dataType, `${dataType}-${id}`],
      });

      return result;
    }
  );

  return data;
}

// ============================================
// 4. React Component with Deduplication Hook
// ============================================

import { useEffect, useState } from 'react';
import { useDeduplicatedFetch } from './middleware';

export function PropertyDetails({ propertyId }: { propertyId: string }) {
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);

  // Create deduplicated fetch function
  const fetchProperty = useDeduplicatedFetch(
    `/api/properties?id=${propertyId}`,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    },
    {
      ttl: 5000,
    }
  );

  useEffect(() => {
    const loadProperty = async () => {
      try {
        const response = await fetchProperty();
        const data = await response.json();
        setProperty(data);
      } catch (error) {
        console.error('Failed to load property:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProperty();
  }, [propertyId]);

  if (loading) return <div>Loading...</div>;
  if (!property) return <div>Property not found</div>;

  return <div>{/* Render property details */}</div>;
}

// ============================================
// 5. Middleware Chain with All Optimizations
// ============================================

import { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const url = new URL(request.url);

  // Skip static assets
  if (url.pathname.startsWith('/_next/static')) {
    return NextResponse.next();
  }

  // Add request ID for tracking
  const requestId = crypto.randomUUID();
  request.headers.set('X-Request-ID', requestId);

  // Add timing header
  request.headers.set('X-Request-Start', Date.now().toString());

  // Check if this is an API route
  if (url.pathname.startsWith('/api')) {
    // Apply deduplication for specific routes
    if (
      url.pathname.startsWith('/api/properties') ||
      url.pathname.startsWith('/api/planning') ||
      url.pathname.startsWith('/api/areas')
    ) {
      // This ensures duplicate concurrent requests are coalesced
      return withDeduplication(
        async (req) => {
          const response = NextResponse.next();

          // Add cache headers for Cloudflare
          response.headers.set(
            'Cache-Control',
            'public, max-age=60, stale-while-revalidate=600'
          );

          // Add performance metrics
          const duration = Date.now() - parseInt(req.headers.get('X-Request-Start')!);
          response.headers.set('X-Response-Time', `${duration}ms`);
          response.headers.set('X-Request-ID', requestId);

          return response;
        },
        {
          ttl: 5000,
          enableMetrics: true,
        }
      )(request);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

// ============================================
// 6. Performance Monitoring Integration
// ============================================

export function setupPerformanceMonitoring() {
  const deduplicator = getGlobalDeduplicator();

  // Monitor deduplication metrics
  deduplicator.on('request:success', (event) => {
    console.log('Deduplicated request completed:', {
      key: event.key,
      waiters: event.waiters,
      duration: event.duration,
    });

    // Send metrics to monitoring service
    sendMetrics({
      type: 'deduplication',
      success: true,
      waiters: event.waiters,
      duration: event.duration,
    });
  });

  deduplicator.on('request:error', (event) => {
    console.error('Deduplicated request failed:', event.error);

    // Send error metrics
    sendMetrics({
      type: 'deduplication',
      success: false,
      error: event.error.message,
    });
  });

  // Monitor cleanup
  deduplicator.on('cleanup', (event) => {
    console.log('Deduplication cleanup:', event.removed, 'expired entries removed');
  });

  // Periodic metrics reporting
  setInterval(() => {
    const metrics = deduplicator.getMetrics();
    console.log('Deduplication metrics:', {
      ...metrics,
      deduplicationRate: `${(metrics.deduplicationRate * 100).toFixed(2)}%`,
      avgWaitTime: `${metrics.avgWaitTime.toFixed(2)}ms`,
    });

    // Send to monitoring dashboard
    sendMetrics({
      type: 'deduplication-summary',
      ...metrics,
    });
  }, 60000); // Every minute
}

// ============================================
// 7. Database Query Deduplication
// ============================================

import { deduplicateAsync } from './middleware';

// Wrap database queries with deduplication
export const deduplicatedQueries = {
  getProperty: deduplicateAsync(
    async (id: string) => {
      // This query will be deduplicated
      return await db.property.findUnique({ where: { id } });
    },
    { ttl: 5000 }
  ),

  getPlanningApplication: deduplicateAsync(
    async (id: string) => {
      return await db.planningApplication.findUnique({ where: { id } });
    },
    { ttl: 10000 }
  ),

  searchProperties: deduplicateAsync(
    async (query: any) => {
      return await db.property.findMany({
        where: query,
        take: 20,
      });
    },
    {
      ttl: 3000,
      keyGenerator: (request) => JSON.stringify(request[0]), // Use query as key
    }
  ),
};

// ============================================
// Helper Functions
// ============================================

async function fetchPropertyFromDatabase(id: string) {
  // Simulated database fetch
  return {
    id,
    address: '123 Example Street',
    price: 500000,
    bedrooms: 3,
    bathrooms: 2,
  };
}

async function fetchFromDatabase(type: string, id: string) {
  // Simulated database fetch
  return {
    type,
    id,
    data: `Data for ${type} ${id}`,
    timestamp: Date.now(),
  };
}

function sendMetrics(metrics: any) {
  // Send to monitoring service (DataDog, New Relic, etc.)
  console.log('Sending metrics:', metrics);
}

const db = {
  property: {
    findUnique: async (query: any) => ({ id: query.where.id, data: 'property' }),
    findMany: async (query: any) => [{ id: '1', data: 'properties' }],
  },
  planningApplication: {
    findUnique: async (query: any) => ({ id: query.where.id, data: 'planning' }),
  },
};

export default {
  propertyAPIWithDeduplication,
  graphqlDeduplicationMiddleware,
  optimizedDataFetch,
  PropertyDetails,
  middleware,
  setupPerformanceMonitoring,
  deduplicatedQueries,
};