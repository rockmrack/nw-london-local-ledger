/**
 * Request Deduplication Middleware
 * Integrates deduplication with Next.js API routes and GraphQL
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGlobalDeduplicator } from './index';
import type { DeduplicationOptions } from './index';

export interface MiddlewareConfig extends DeduplicationOptions {
  excludePaths?: string[];
  includePaths?: string[];
  graphqlPath?: string;
}

/**
 * Next.js API Route middleware for request deduplication
 */
export function withDeduplication(
  handler: (req: NextRequest) => Promise<NextResponse>,
  config: MiddlewareConfig = {}
) {
  const deduplicator = getGlobalDeduplicator(config);

  return async function deduplicatedHandler(req: NextRequest): Promise<NextResponse> {
    const url = new URL(req.url);
    const path = url.pathname;

    // Check if path should be excluded
    if (config.excludePaths?.some(p => path.startsWith(p))) {
      return handler(req);
    }

    // Check if path should be included (if specified)
    if (config.includePaths && !config.includePaths.some(p => path.startsWith(p))) {
      return handler(req);
    }

    try {
      // Generate request key
      const requestData = {
        url: req.url,
        method: req.method,
        headers: Object.fromEntries(req.headers.entries()),
        body: req.method !== 'GET' ? await req.text() : null,
      };

      // Execute with deduplication
      const response = await deduplicator.execute(requestData, async () => {
        // Reset body for handler
        if (requestData.body) {
          const newReq = new NextRequest(req.url, {
            method: req.method,
            headers: req.headers,
            body: requestData.body,
          });
          return handler(newReq);
        }
        return handler(req);
      });

      return response;
    } catch (error) {
      console.error('Deduplication error:', error);
      // Fallback to direct execution on deduplication error
      return handler(req);
    }
  };
}

/**
 * Express-style middleware for request deduplication
 */
export function createExpressDeduplicationMiddleware(config: MiddlewareConfig = {}) {
  const deduplicator = getGlobalDeduplicator(config);

  return async function deduplicationMiddleware(
    req: any,
    res: any,
    next: any
  ): Promise<void> {
    // Check if path should be excluded
    if (config.excludePaths?.some(p => req.path.startsWith(p))) {
      return next();
    }

    // Check if path should be included (if specified)
    if (config.includePaths && !config.includePaths.some(p => req.path.startsWith(p))) {
      return next();
    }

    // Store original send function
    const originalSend = res.send;
    const originalJson = res.json;
    let responseData: any = null;
    let responseSent = false;

    // Override send/json to capture response
    res.send = function(data: any) {
      if (!responseSent) {
        responseData = data;
        responseSent = true;
      }
      return originalSend.call(this, data);
    };

    res.json = function(data: any) {
      if (!responseSent) {
        responseData = data;
        responseSent = true;
      }
      return originalJson.call(this, data);
    };

    try {
      // Generate request key
      const requestData = {
        url: req.url,
        path: req.path,
        method: req.method,
        headers: req.headers,
        query: req.query,
        params: req.params,
        body: req.body,
      };

      // Execute with deduplication
      await deduplicator.execute(requestData, async () => {
        return new Promise((resolve, reject) => {
          // Continue to next middleware/handler
          next();

          // Wait for response
          const checkInterval = setInterval(() => {
            if (responseSent) {
              clearInterval(checkInterval);
              resolve(responseData);
            }
          }, 10);

          // Timeout after 30 seconds
          setTimeout(() => {
            clearInterval(checkInterval);
            if (!responseSent) {
              reject(new Error('Request timeout'));
            }
          }, 30000);
        });
      });
    } catch (error) {
      console.error('Deduplication error:', error);
      // Fallback to direct execution on deduplication error
      next();
    }
  };
}

/**
 * GraphQL-specific deduplication middleware
 */
export function createGraphQLDeduplicationMiddleware(config: MiddlewareConfig = {}) {
  const deduplicator = getGlobalDeduplicator({
    ...config,
    keyGenerator: (request) => {
      // Custom key generation for GraphQL
      const { query, variables, operationName } = request.body || {};
      return JSON.stringify({
        query: query?.replace(/\s+/g, ' ').trim(), // Normalize whitespace
        variables: variables || {},
        operationName: operationName || null,
      });
    },
  });

  return async function graphqlDeduplicationMiddleware(
    req: any,
    res: any,
    next: any
  ): Promise<void> {
    // Only apply to GraphQL endpoint
    const graphqlPath = config.graphqlPath || '/api/graphql';
    if (!req.path.startsWith(graphqlPath)) {
      return next();
    }

    // Only deduplicate queries, not mutations or subscriptions
    const { query } = req.body || {};
    if (!query || query.trim().startsWith('mutation') || query.trim().startsWith('subscription')) {
      return next();
    }

    // Store original send function
    const originalJson = res.json;
    let responseData: any = null;
    let responseSent = false;

    // Override json to capture response
    res.json = function(data: any) {
      if (!responseSent) {
        responseData = data;
        responseSent = true;
      }
      return originalJson.call(this, data);
    };

    try {
      // Execute with deduplication
      const result = await deduplicator.execute(req, async () => {
        return new Promise((resolve, reject) => {
          // Continue to next middleware/handler
          next();

          // Wait for response
          const checkInterval = setInterval(() => {
            if (responseSent) {
              clearInterval(checkInterval);
              resolve(responseData);
            }
          }, 10);

          // Timeout after 30 seconds
          setTimeout(() => {
            clearInterval(checkInterval);
            if (!responseSent) {
              reject(new Error('GraphQL request timeout'));
            }
          }, 30000);
        });
      });

      // Send deduplicated result
      if (!responseSent) {
        res.json(result);
      }
    } catch (error) {
      console.error('GraphQL deduplication error:', error);
      // Fallback to direct execution on deduplication error
      if (!responseSent) {
        next();
      }
    }
  };
}

/**
 * Create deduplication middleware for specific data types
 */
export function createDataTypeDeduplicationMiddleware(
  dataType: 'property' | 'planning' | 'area' | 'search',
  config: MiddlewareConfig = {}
) {
  const ttlMap = {
    property: 30000,    // 30 seconds
    planning: 60000,    // 1 minute
    area: 300000,       // 5 minutes
    search: 10000,      // 10 seconds
  };

  return createExpressDeduplicationMiddleware({
    ...config,
    ttl: ttlMap[dataType],
    includePaths: config.includePaths || [`/api/${dataType}`],
  });
}

/**
 * Utility to deduplicate async functions
 */
export function deduplicateAsync<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: DeduplicationOptions = {}
): T {
  const deduplicator = getGlobalDeduplicator(options);

  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    const request = {
      function: fn.name || 'anonymous',
      arguments: args,
    };

    return deduplicator.execute(request, () => fn(...args));
  }) as T;
}

/**
 * React Hook for deduplicating API calls
 */
export function useDeduplicatedFetch(
  url: string,
  options: RequestInit = {},
  dedupeOptions: DeduplicationOptions = {}
) {
  const deduplicator = getGlobalDeduplicator(dedupeOptions);

  return async (): Promise<Response> => {
    const request = {
      url,
      ...options,
    };

    return deduplicator.execute(request, () => fetch(url, options));
  };
}

export default {
  withDeduplication,
  createExpressDeduplicationMiddleware,
  createGraphQLDeduplicationMiddleware,
  createDataTypeDeduplicationMiddleware,
  deduplicateAsync,
  useDeduplicatedFetch,
};