/**
 * GraphQL API Route
 * Handles GraphQL requests with Next.js App Router
 */

import { startServerAndCreateNextHandler } from '@as-integrations/next';
import { NextRequest, NextResponse } from 'next/server';
import { createGraphQLServer, createGraphQLContext, getPersistedQuery } from '@/graphql/server';
import { MonitoringService } from '@/lib/monitoring/monitoring-service';
import { MultiLayerCache } from '@/lib/cache/multi-layer-cache';

// Initialize services
const monitoring = new MonitoringService();
const cache = new MultiLayerCache();

// Create GraphQL server
const server = createGraphQLServer();

// Create handler
const handler = startServerAndCreateNextHandler<NextRequest>(server, {
  context: async (req) => {
    const startTime = Date.now();

    // Check for authentication if needed
    const authHeader = req.headers.get('authorization');

    // Create context
    const context = await createGraphQLContext();

    // Record context creation time
    monitoring.recordMetric('graphql.context.creation', Date.now() - startTime);

    return context;
  }
});

// OPTIONS handler for CORS
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  });
}

// GET handler for GraphQL queries
export async function GET(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Check for cached response first
    const url = new URL(req.url);
    const query = url.searchParams.get('query');
    const variables = url.searchParams.get('variables');
    const operationName = url.searchParams.get('operationName');
    const extensions = url.searchParams.get('extensions');

    // Check for persisted query
    if (extensions) {
      try {
        const ext = JSON.parse(extensions);
        if (ext.persistedQuery?.sha256Hash) {
          const persistedQuery = getPersistedQuery(ext.persistedQuery.sha256Hash);
          if (persistedQuery) {
            // Use persisted query
            url.searchParams.set('query', persistedQuery);
            monitoring.recordMetric('graphql.persisted.used', 1);
          }
        }
      } catch (e) {
        // Invalid extensions, continue with normal processing
      }
    }

    // Check cache for GET requests
    const cacheKey = `graphql:get:${operationName}:${variables}`;
    const cachedResult = await cache.get(cacheKey);

    if (cachedResult) {
      monitoring.recordMetric('graphql.cache.hit', 1);
      monitoring.recordMetric('graphql.request.duration', Date.now() - startTime);

      return NextResponse.json(cachedResult, {
        headers: {
          'X-Cache': 'HIT',
          'Cache-Control': 'public, max-age=60',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Process request
    const response = await handler(req);

    // Cache successful responses
    if (response.status === 200) {
      const responseData = await response.clone().json();
      if (!responseData.errors) {
        await cache.set(cacheKey, responseData, {
          ttl: 60, // 1 minute for GET requests
          tags: ['graphql', 'get', operationName || 'query']
        });
      }
    }

    monitoring.recordMetric('graphql.cache.miss', 1);
    monitoring.recordMetric('graphql.request.duration', Date.now() - startTime);

    // Add CORS and cache headers
    const headers = new Headers(response.headers);
    headers.set('X-Cache', 'MISS');
    headers.set('Cache-Control', 'public, max-age=60');
    headers.set('Access-Control-Allow-Origin', '*');

    return new NextResponse(response.body, {
      status: response.status,
      headers
    });
  } catch (error) {
    monitoring.recordError(error as Error, {
      handler: 'graphql.GET'
    });

    return NextResponse.json(
      { errors: [{ message: 'Internal server error' }] },
      { status: 500 }
    );
  }
}

// POST handler for GraphQL mutations and queries
export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse request body
    const body = await req.json();
    const { query, variables, operationName, extensions } = body;

    // Check for persisted query
    if (extensions?.persistedQuery?.sha256Hash && !query) {
      const persistedQuery = getPersistedQuery(extensions.persistedQuery.sha256Hash);
      if (persistedQuery) {
        // Modify request to include persisted query
        const modifiedReq = new NextRequest(req.url, {
          method: 'POST',
          headers: req.headers,
          body: JSON.stringify({
            ...body,
            query: persistedQuery
          })
        });

        monitoring.recordMetric('graphql.persisted.used', 1);

        const response = await handler(modifiedReq);
        monitoring.recordMetric('graphql.request.duration', Date.now() - startTime);

        // Add CORS headers
        const headers = new Headers(response.headers);
        headers.set('Access-Control-Allow-Origin', '*');

        return new NextResponse(response.body, {
          status: response.status,
          headers
        });
      } else {
        // Persisted query not found
        return NextResponse.json(
          {
            errors: [{
              message: 'PersistedQueryNotFound',
              extensions: {
                code: 'PERSISTED_QUERY_NOT_FOUND'
              }
            }]
          },
          {
            status: 200,
            headers: {
              'Access-Control-Allow-Origin': '*'
            }
          }
        );
      }
    }

    // Check if this is a query that can be cached
    const isQuery = !query || query.trim().startsWith('query');
    const cacheKey = isQuery ? `graphql:post:${operationName}:${JSON.stringify(variables)}` : null;

    if (cacheKey) {
      const cachedResult = await cache.get(cacheKey);
      if (cachedResult) {
        monitoring.recordMetric('graphql.cache.hit', 1);
        monitoring.recordMetric('graphql.request.duration', Date.now() - startTime);

        return NextResponse.json(cachedResult, {
          headers: {
            'X-Cache': 'HIT',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }

    // Process request
    const response = await handler(req);

    // Cache successful query responses
    if (response.status === 200 && cacheKey) {
      const responseData = await response.clone().json();
      if (!responseData.errors) {
        await cache.set(cacheKey, responseData, {
          ttl: 300, // 5 minutes for POST queries
          tags: ['graphql', 'post', operationName || 'query']
        });
      }
    }

    monitoring.recordMetric('graphql.cache.miss', 1);
    monitoring.recordMetric('graphql.request.duration', Date.now() - startTime);

    // Add CORS headers
    const headers = new Headers(response.headers);
    headers.set('X-Cache', cacheKey ? 'MISS' : 'SKIP');
    headers.set('Access-Control-Allow-Origin', '*');

    return new NextResponse(response.body, {
      status: response.status,
      headers
    });
  } catch (error) {
    monitoring.recordError(error as Error, {
      handler: 'graphql.POST'
    });

    return NextResponse.json(
      { errors: [{ message: 'Internal server error' }] },
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
}