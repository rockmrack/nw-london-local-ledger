/**
 * Request Deduplication Manager
 * Prevents duplicate concurrent requests for the same resource
 * Coalesces multiple identical requests into a single backend call
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';

export interface DeduplicationOptions {
  ttl?: number; // Time to keep the dedup entry (ms)
  keyGenerator?: (request: any) => string;
  enableMetrics?: boolean;
  maxConcurrentRequests?: number;
}

export interface DeduplicationMetrics {
  totalRequests: number;
  duplicateRequests: number;
  coalescedRequests: number;
  uniqueRequests: number;
  activeRequests: number;
  deduplicationRate: number;
  avgWaitTime: number;
  errors: number;
  timestamp: number;
}

interface PendingRequest {
  promise: Promise<any>;
  resolver: (value: any) => void;
  rejector: (error: any) => void;
  waiters: Array<{
    resolve: (value: any) => void;
    reject: (error: any) => void;
    startTime: number;
  }>;
  startTime: number;
  key: string;
  ttl: number;
}

class RequestDeduplicator extends EventEmitter {
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private metrics: DeduplicationMetrics = {
    totalRequests: 0,
    duplicateRequests: 0,
    coalescedRequests: 0,
    uniqueRequests: 0,
    activeRequests: 0,
    deduplicationRate: 0,
    avgWaitTime: 0,
    errors: 0,
    timestamp: Date.now(),
  };
  private waitTimes: number[] = [];
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private options: DeduplicationOptions = {}) {
    super();
    this.options = {
      ttl: 5000, // Default 5 seconds
      enableMetrics: true,
      maxConcurrentRequests: 1000,
      ...options,
    };

    // Start cleanup interval
    if (this.options.ttl && this.options.ttl > 0) {
      this.cleanupInterval = setInterval(() => {
        this.cleanup();
      }, Math.min(this.options.ttl, 1000));
    }
  }

  /**
   * Generate a unique key for the request
   */
  private generateKey(request: any): string {
    if (this.options.keyGenerator) {
      return this.options.keyGenerator(request);
    }

    // Default key generation based on URL and critical parameters
    const keyData = {
      url: request.url || request.path || '',
      method: request.method || 'GET',
      body: request.body || '',
      params: request.params || {},
      query: request.query || {},
    };

    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(keyData));
    return hash.digest('hex');
  }

  /**
   * Execute request with deduplication
   */
  async execute<T>(
    request: any,
    handler: () => Promise<T>
  ): Promise<T> {
    const key = this.generateKey(request);
    const startTime = Date.now();

    // Update metrics
    this.metrics.totalRequests++;

    // Check for existing pending request
    const pending = this.pendingRequests.get(key);
    if (pending) {
      // Duplicate request - coalesce
      this.metrics.duplicateRequests++;
      this.metrics.coalescedRequests++;

      // Check max concurrent requests
      if (this.pendingRequests.size >= (this.options.maxConcurrentRequests || 1000)) {
        throw new Error('Max concurrent requests exceeded');
      }

      // Add waiter
      return new Promise<T>((resolve, reject) => {
        pending.waiters.push({
          resolve,
          reject,
          startTime,
        });

        // Update active requests
        this.metrics.activeRequests = this.pendingRequests.size;
      });
    }

    // New unique request
    this.metrics.uniqueRequests++;

    // Create pending request entry
    const pendingRequest: PendingRequest = {
      promise: null as any,
      resolver: null as any,
      rejector: null as any,
      waiters: [],
      startTime,
      key,
      ttl: this.options.ttl || 5000,
    };

    // Create promise that will be shared
    pendingRequest.promise = new Promise(async (resolve, reject) => {
      pendingRequest.resolver = resolve;
      pendingRequest.rejector = reject;

      try {
        // Execute the actual request
        const result = await handler();

        // Resolve all waiters
        for (const waiter of pendingRequest.waiters) {
          waiter.resolve(result);

          // Track wait time
          const waitTime = Date.now() - waiter.startTime;
          this.waitTimes.push(waitTime);
        }

        // Resolve original request
        resolve(result);

        // Emit success event
        this.emit('request:success', {
          key,
          waiters: pendingRequest.waiters.length,
          duration: Date.now() - startTime,
        });

      } catch (error) {
        this.metrics.errors++;

        // Reject all waiters
        for (const waiter of pendingRequest.waiters) {
          waiter.reject(error);
        }

        // Reject original request
        reject(error);

        // Emit error event
        this.emit('request:error', {
          key,
          waiters: pendingRequest.waiters.length,
          error,
        });

      } finally {
        // Clean up after a delay to allow for rapid subsequent requests
        setTimeout(() => {
          this.pendingRequests.delete(key);
          this.metrics.activeRequests = this.pendingRequests.size;
        }, 100);
      }
    });

    // Store pending request
    this.pendingRequests.set(key, pendingRequest);
    this.metrics.activeRequests = this.pendingRequests.size;

    return pendingRequest.promise;
  }

  /**
   * Cleanup expired pending requests
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, pending] of this.pendingRequests.entries()) {
      if (now - pending.startTime > pending.ttl) {
        keysToDelete.push(key);

        // Timeout error for waiters
        const error = new Error('Request timeout');
        for (const waiter of pending.waiters) {
          waiter.reject(error);
        }
        pending.rejector(error);
      }
    }

    // Delete expired entries
    for (const key of keysToDelete) {
      this.pendingRequests.delete(key);
    }

    if (keysToDelete.length > 0) {
      this.metrics.activeRequests = this.pendingRequests.size;
      this.emit('cleanup', { removed: keysToDelete.length });
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): DeduplicationMetrics {
    // Calculate deduplication rate
    if (this.metrics.totalRequests > 0) {
      this.metrics.deduplicationRate =
        this.metrics.duplicateRequests / this.metrics.totalRequests;
    }

    // Calculate average wait time
    if (this.waitTimes.length > 0) {
      const sum = this.waitTimes.reduce((a, b) => a + b, 0);
      this.metrics.avgWaitTime = sum / this.waitTimes.length;

      // Keep only last 1000 wait times
      if (this.waitTimes.length > 1000) {
        this.waitTimes = this.waitTimes.slice(-1000);
      }
    }

    this.metrics.timestamp = Date.now();
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      duplicateRequests: 0,
      coalescedRequests: 0,
      uniqueRequests: 0,
      activeRequests: this.pendingRequests.size,
      deduplicationRate: 0,
      avgWaitTime: 0,
      errors: 0,
      timestamp: Date.now(),
    };
    this.waitTimes = [];
  }

  /**
   * Clear all pending requests
   */
  clear(): void {
    for (const [key, pending] of this.pendingRequests.entries()) {
      const error = new Error('Request cancelled');
      for (const waiter of pending.waiters) {
        waiter.reject(error);
      }
      pending.rejector(error);
    }
    this.pendingRequests.clear();
    this.metrics.activeRequests = 0;
  }

  /**
   * Destroy the deduplicator
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
    this.removeAllListeners();
  }
}

// Global instance for singleton pattern
let globalDeduplicator: RequestDeduplicator | null = null;

/**
 * Get or create global deduplicator instance
 */
export function getGlobalDeduplicator(
  options?: DeduplicationOptions
): RequestDeduplicator {
  if (!globalDeduplicator) {
    globalDeduplicator = new RequestDeduplicator(options);
  }
  return globalDeduplicator;
}

/**
 * Destroy global deduplicator
 */
export function destroyGlobalDeduplicator(): void {
  if (globalDeduplicator) {
    globalDeduplicator.destroy();
    globalDeduplicator = null;
  }
}

export { RequestDeduplicator };
export default RequestDeduplicator;