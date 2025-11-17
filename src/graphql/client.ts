/**
 * GraphQL Client Configuration
 * Provides optimized client with caching and batching
 */

import { GraphQLClient } from 'graphql-request';
import { createHash } from 'crypto';

// Client configuration
const GRAPHQL_ENDPOINT = process.env.NEXT_PUBLIC_GRAPHQL_URL || 'http://localhost:3000/api/graphql';
const ENABLE_PERSISTED_QUERIES = process.env.NEXT_PUBLIC_ENABLE_APQ !== 'false';
const BATCH_INTERVAL = 10; // milliseconds
const MAX_BATCH_SIZE = 10;

// Persisted query cache
const persistedQueryCache = new Map<string, string>();

// Batch queue
let batchQueue: Array<{
  query: string;
  variables?: any;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
}> = [];
let batchTimer: NodeJS.Timeout | null = null;

// Create base client
const client = new GraphQLClient(GRAPHQL_ENDPOINT, {
  headers: {
    'Content-Type': 'application/json'
  }
});

/**
 * Calculate SHA256 hash for APQ
 */
function calculateQueryHash(query: string): string {
  return createHash('sha256').update(query).digest('hex');
}

/**
 * Execute GraphQL query with APQ support
 */
export async function graphqlRequest<T = any>(
  query: string,
  variables?: any,
  options: {
    skipCache?: boolean;
    persistedQueryId?: string;
    headers?: Record<string, string>;
  } = {}
): Promise<T> {
  const { skipCache = false, persistedQueryId, headers = {} } = options;

  // Try APQ if enabled
  if (ENABLE_PERSISTED_QUERIES && !skipCache) {
    const queryHash = persistedQueryId || calculateQueryHash(query);

    try {
      // First try with just the hash
      const response = await fetch(GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify({
          variables,
          extensions: {
            persistedQuery: {
              version: 1,
              sha256Hash: queryHash
            }
          }
        })
      });

      const result = await response.json();

      // If query not found, send with full query
      if (result.errors?.some((e: any) => e.message === 'PersistedQueryNotFound')) {
        const retryResponse = await fetch(GRAPHQL_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers
          },
          body: JSON.stringify({
            query,
            variables,
            extensions: {
              persistedQuery: {
                version: 1,
                sha256Hash: queryHash
              }
            }
          })
        });

        return retryResponse.json();
      }

      return result;
    } catch (error) {
      console.error('APQ request failed, falling back to normal request:', error);
    }
  }

  // Normal request
  return client.request(query, variables, headers);
}

/**
 * Batch multiple GraphQL queries
 */
export async function batchedGraphqlRequest<T = any>(
  query: string,
  variables?: any
): Promise<T> {
  return new Promise((resolve, reject) => {
    // Add to batch queue
    batchQueue.push({ query, variables, resolve, reject });

    // If batch is full, execute immediately
    if (batchQueue.length >= MAX_BATCH_SIZE) {
      executeBatch();
      return;
    }

    // Otherwise, schedule batch execution
    if (!batchTimer) {
      batchTimer = setTimeout(executeBatch, BATCH_INTERVAL);
    }
  });
}

/**
 * Execute batched requests
 */
async function executeBatch() {
  const batch = [...batchQueue];
  batchQueue = [];

  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }

  if (batch.length === 0) return;

  try {
    // Combine queries into a single request
    const combinedQuery = `
      query BatchedQuery {
        ${batch.map((item, index) => `
          q${index}: ${item.query}
        `).join('\n')}
      }
    `;

    // Combine variables
    const combinedVariables = batch.reduce((acc, item, index) => {
      if (item.variables) {
        Object.keys(item.variables).forEach(key => {
          acc[`q${index}_${key}`] = item.variables[key];
        });
      }
      return acc;
    }, {});

    // Execute batched request
    const response = await graphqlRequest(combinedQuery, combinedVariables);

    // Distribute results
    batch.forEach((item, index) => {
      item.resolve(response[`q${index}`]);
    });
  } catch (error) {
    // Reject all promises in batch
    batch.forEach(item => {
      item.reject(error);
    });
  }
}

/**
 * Prefetch and cache queries
 */
export async function prefetchQuery(
  query: string,
  variables?: any,
  ttl: number = 300000 // 5 minutes
): Promise<void> {
  const cacheKey = `${query}-${JSON.stringify(variables)}`;

  // Check if already cached
  if (persistedQueryCache.has(cacheKey)) {
    return;
  }

  try {
    const result = await graphqlRequest(query, variables);
    persistedQueryCache.set(cacheKey, JSON.stringify(result));

    // Set TTL for cache entry
    setTimeout(() => {
      persistedQueryCache.delete(cacheKey);
    }, ttl);
  } catch (error) {
    console.error('Prefetch failed:', error);
  }
}

/**
 * Get cached query result
 */
export function getCachedQuery<T = any>(query: string, variables?: any): T | null {
  const cacheKey = `${query}-${JSON.stringify(variables)}`;
  const cached = persistedQueryCache.get(cacheKey);

  if (cached) {
    return JSON.parse(cached) as T;
  }

  return null;
}

/**
 * GraphQL Subscription client (WebSocket)
 */
export class GraphQLSubscriptionClient {
  private ws: WebSocket | null = null;
  private subscriptions = new Map<string, (data: any) => void>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(private wsUrl: string = 'ws://localhost:3000/api/graphql') {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket closed');
        this.handleReconnect();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const { id, payload } = data;

          const handler = this.subscriptions.get(id);
          if (handler) {
            handler(payload);
          }
        } catch (error) {
          console.error('Failed to handle message:', error);
        }
      };
    });
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);

      setTimeout(() => {
        this.connect().catch(console.error);
      }, this.reconnectDelay * this.reconnectAttempts);
    }
  }

  subscribe(
    id: string,
    query: string,
    variables?: any,
    handler?: (data: any) => void
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    if (handler) {
      this.subscriptions.set(id, handler);
    }

    this.ws.send(JSON.stringify({
      id,
      type: 'subscribe',
      payload: {
        query,
        variables
      }
    }));
  }

  unsubscribe(id: string): void {
    this.subscriptions.delete(id);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        id,
        type: 'unsubscribe'
      }));
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscriptions.clear();
  }
}

// Export singleton subscription client
export const subscriptionClient = new GraphQLSubscriptionClient();

// Export default client
export default client;