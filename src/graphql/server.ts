/**
 * GraphQL Server Configuration
 * Includes performance optimizations, security, and monitoring
 */

import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import depthLimit from 'graphql-depth-limit';
import { createComplexityRule, simpleEstimator } from 'graphql-query-complexity';
import { GraphQLError } from 'graphql';
import { typeDefs } from './schema/types';
import { resolvers } from './resolvers';
import { createDataLoaders } from './dataloaders';
import { MultiLayerCache } from '@/lib/cache/multi-layer-cache';
import { MonitoringService } from '@/lib/monitoring/monitoring-service';
import type { GraphQLContext } from './resolvers';

// Create cache instance
const cache = new MultiLayerCache();
const monitoring = new MonitoringService();

// Query complexity configuration
const MAX_QUERY_COMPLEXITY = 1000;
const MAX_QUERY_DEPTH = 7;

// Persisted queries store (in production, use Redis)
const persistedQueries = new Map<string, string>();

// APQ (Automatic Persisted Queries) cache
const apqCache = new Map<string, string>();

// Create Apollo Server
export const createGraphQLServer = () => {
  return new ApolloServer<GraphQLContext>({
    typeDefs,
    resolvers,
    validationRules: [
      depthLimit(MAX_QUERY_DEPTH),
      createComplexityRule({
        estimators: [
          simpleEstimator({ defaultComplexity: 1 })
        ],
        maximumComplexity: MAX_QUERY_COMPLEXITY,
        onComplete: (complexity: number) => {
          monitoring.recordMetric('graphql.query.complexity', complexity);
        },
        createError: (max: number, actual: number) => {
          return new GraphQLError(
            `Query complexity ${actual} exceeds maximum complexity ${max}`
          );
        }
      })
    ],
    plugins: [
      // Landing page for GraphiQL in development
      process.env.NODE_ENV !== 'production'
        ? ApolloServerPluginLandingPageLocalDefault({ embed: true })
        : undefined,

      // Request lifecycle plugin
      {
        async requestDidStart() {
          const startTime = Date.now();

          return {
            async willSendResponse(requestContext) {
              const duration = Date.now() - startTime;
              const operationName = requestContext.request.operationName || 'unknown';

              // Record metrics
              monitoring.recordMetric('graphql.request.duration', duration, {
                operation: operationName
              });

              // Log slow queries
              if (duration > 1000) {
                monitoring.recordPerformance({
                  operation: 'graphql',
                  duration,
                  metadata: {
                    operationName,
                    query: requestContext.request.query
                  }
                });
              }
            },

            async didEncounterErrors(requestContext) {
              requestContext.errors?.forEach(error => {
                monitoring.recordError(error, {
                  operation: requestContext.request.operationName || 'unknown',
                  query: requestContext.request.query
                });
              });
            }
          };
        }
      },

      // APQ (Automatic Persisted Queries) plugin
      {
        async requestDidStart() {
          return {
            async willSendResponse(requestContext) {
              const { request } = requestContext;

              // Check for APQ extension
              if (request.extensions?.persistedQuery) {
                const { sha256Hash, version } = request.extensions.persistedQuery;

                if (version !== 1) {
                  throw new GraphQLError('Unsupported persisted query version');
                }

                // Try to get query from cache
                const cachedQuery = apqCache.get(sha256Hash);

                if (!cachedQuery && request.query) {
                  // Store query in APQ cache
                  apqCache.set(sha256Hash, request.query);
                  monitoring.recordMetric('graphql.apq.miss', 1);
                } else if (cachedQuery) {
                  monitoring.recordMetric('graphql.apq.hit', 1);
                }
              }
            }
          };
        }
      },

      // Query result caching plugin
      {
        async requestDidStart() {
          return {
            async willSendResponse(requestContext) {
              const { request, response } = requestContext;

              // Only cache successful GET queries
              if (
                request.http?.method === 'GET' &&
                !response.errors &&
                response.data
              ) {
                const cacheKey = `graphql:${request.operationName}:${JSON.stringify(request.variables)}`;

                await cache.set(cacheKey, response.data, {
                  ttl: 300, // 5 minutes
                  tags: ['graphql', request.operationName || 'query']
                });
              }
            }
          };
        }
      }
    ].filter(Boolean),

    // Introspection disabled in production
    introspection: process.env.NODE_ENV !== 'production',

    // Include stack traces in development
    includeStacktraceInErrorResponses: process.env.NODE_ENV !== 'production',

    // Format errors
    formatError: (formattedError, error) => {
      // Log errors
      monitoring.recordError(error as Error, {
        graphql: true,
        path: formattedError.path
      });

      // Remove stack traces in production
      if (process.env.NODE_ENV === 'production') {
        delete formattedError.extensions?.stacktrace;
      }

      return formattedError;
    }
  });
};

// Create context for each request
export const createGraphQLContext = async (): Promise<GraphQLContext> => {
  return {
    dataloaders: createDataLoaders(),
    cache
  };
};

// Export persisted query functions
export const persistQuery = (id: string, query: string) => {
  persistedQueries.set(id, query);
  monitoring.recordMetric('graphql.persisted.stored', 1);
};

export const getPersistedQuery = (id: string): string | undefined => {
  const query = persistedQueries.get(id);
  if (query) {
    monitoring.recordMetric('graphql.persisted.hit', 1);
  } else {
    monitoring.recordMetric('graphql.persisted.miss', 1);
  }
  return query;
};

// Batch request handler for optimized loading
export const batchRequestHandler = async (requests: any[]) => {
  const startTime = Date.now();
  const results = await Promise.all(
    requests.map(async (request) => {
      // Process each request with shared DataLoaders
      const context = await createGraphQLContext();
      // Process request (implementation depends on your setup)
      return request;
    })
  );

  const duration = Date.now() - startTime;
  monitoring.recordMetric('graphql.batch.duration', duration, {
    requestCount: requests.length
  });

  return results;
};

// Export utilities for monitoring
export const getGraphQLMetrics = () => {
  return {
    apqCacheSize: apqCache.size,
    persistedQueriesSize: persistedQueries.size,
    maxComplexity: MAX_QUERY_COMPLEXITY,
    maxDepth: MAX_QUERY_DEPTH
  };
};