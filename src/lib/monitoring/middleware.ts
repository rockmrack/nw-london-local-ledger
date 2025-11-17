/**
 * Monitoring middleware for Next.js applications
 */

import { NextRequest, NextResponse } from 'next/server';
import { monitoringService } from './monitoring-service';

export interface MonitoringContext {
  requestId: string;
  method: string;
  path: string;
  startTime: number;
  userId?: string;
  sessionId?: string;
}

/**
 * Performance monitoring middleware for Next.js
 */
export function performanceMiddleware(request: NextRequest) {
  const startTime = Date.now();
  const method = request.method;
  const path = request.nextUrl.pathname;

  // Start monitoring operation
  const requestId = monitoringService.startOperation(`api.${method}.${path}`, {
    method,
    path,
    headers: Object.fromEntries(request.headers.entries()),
    query: Object.fromEntries(request.nextUrl.searchParams.entries())
  });

  // Clone the request to add monitoring context
  const headers = new Headers(request.headers);
  headers.set('x-request-id', requestId);
  headers.set('x-request-start', startTime.toString());

  return NextResponse.next({
    request: {
      headers,
    },
  });
}

/**
 * API route wrapper for monitoring
 */
export function withMonitoring<T extends (...args: any[]) => any>(
  handler: T,
  options?: {
    operation?: string;
    skipLogging?: boolean;
  }
): T {
  return (async (...args: Parameters<T>) => {
    const [req, res] = args as [any, any];
    const startTime = Date.now();

    // Get request ID from middleware or generate new one
    const requestId = req.headers['x-request-id'] ||
      monitoringService.startOperation(
        options?.operation || `api.${req.method}.${req.url}`,
        {
          method: req.method,
          url: req.url,
          headers: req.headers,
          query: req.query,
          body: req.body
        }
      );

    try {
      // Execute the handler
      const result = await handler(...args);

      // Record successful request
      const duration = Date.now() - startTime;

      if (!options?.skipLogging) {
        monitoringService.recordApiRequest(
          req.method,
          req.url,
          res?.statusCode || 200,
          duration,
          {
            requestId,
            responseSize: JSON.stringify(result).length
          }
        );
      }

      // End operation
      if (requestId) {
        monitoringService.endOperation(requestId, {
          statusCode: res?.statusCode || 200,
          success: true
        });
      }

      return result;
    } catch (error) {
      // Record error
      const duration = Date.now() - startTime;

      monitoringService.recordError(error as Error, {
        requestId,
        method: req.method,
        url: req.url
      });

      if (!options?.skipLogging) {
        monitoringService.recordApiRequest(
          req.method,
          req.url,
          500,
          duration,
          {
            requestId,
            error: (error as Error).message
          }
        );
      }

      // End operation with error
      if (requestId) {
        monitoringService.endOperation(requestId, {
          statusCode: 500,
          success: false,
          error: (error as Error).message
        });
      }

      throw error;
    }
  }) as T;
}

/**
 * Express-style middleware for monitoring
 */
export function expressMonitoringMiddleware() {
  return (req: any, res: any, next: any) => {
    const startTime = Date.now();

    // Start monitoring
    const requestId = monitoringService.startOperation(
      `api.${req.method}.${req.path}`,
      {
        method: req.method,
        path: req.path,
        query: req.query,
        headers: req.headers
      }
    );

    // Store request ID
    req.requestId = requestId;

    // Override res.end to capture response
    const originalEnd = res.end;
    res.end = function(...args: any[]) {
      const duration = Date.now() - startTime;

      // Record the request
      monitoringService.recordApiRequest(
        req.method,
        req.path,
        res.statusCode,
        duration,
        {
          requestId,
          contentLength: res.get('content-length')
        }
      );

      // End monitoring operation
      monitoringService.endOperation(requestId, {
        statusCode: res.statusCode,
        success: res.statusCode < 400
      });

      // Call original end
      originalEnd.apply(res, args);
    };

    next();
  };
}

/**
 * Database query monitoring wrapper
 */
export function monitorQuery<T extends (...args: any[]) => any>(
  queryFn: T,
  queryName?: string
): T {
  return (async (...args: Parameters<T>) => {
    const startTime = Date.now();
    const query = queryName || args[0]?.toString() || 'unknown_query';

    try {
      const result = await queryFn(...args);
      const duration = Date.now() - startTime;

      // Record query performance
      monitoringService.recordQuery(query, duration, {
        rows: Array.isArray(result) ? result.length : undefined,
        success: true
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Record failed query
      monitoringService.recordQuery(query, duration, {
        success: false,
        error: (error as Error).message
      });

      throw error;
    }
  }) as T;
}

/**
 * Cache monitoring wrapper
 */
export function monitorCache<T extends (...args: any[]) => any>(
  cacheFn: T,
  keyExtractor?: (args: Parameters<T>) => string
): T {
  return (async (...args: Parameters<T>) => {
    const key = keyExtractor ? keyExtractor(args) : args[0]?.toString() || 'unknown_key';

    try {
      const result = await cacheFn(...args);
      const hit = result !== null && result !== undefined;

      // Record cache operation
      monitoringService.recordCacheOperation(hit, key);

      return result;
    } catch (error) {
      // Record cache miss on error
      monitoringService.recordCacheOperation(false, key, {
        error: (error as Error).message
      });

      throw error;
    }
  }) as T;
}

/**
 * Queue job monitoring wrapper
 */
export function monitorQueueJob<T extends (...args: any[]) => any>(
  jobFn: T,
  jobName: string
): T {
  return (async (...args: Parameters<T>) => {
    const startTime = Date.now();

    try {
      const result = await jobFn(...args);
      const duration = Date.now() - startTime;

      // Record successful job
      monitoringService.recordQueueJob(jobName, true, duration);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Record failed job
      monitoringService.recordQueueJob(jobName, false, duration, {
        error: (error as Error).message
      });

      throw error;
    }
  }) as T;
}

/**
 * Create a performance span for detailed tracing
 */
export function createSpan(requestId: string, name: string, tags?: Record<string, any>) {
  const span = monitoringService.startSpan(requestId, name, tags);

  return {
    end: () => monitoringService.endSpan(span),
    addTag: (key: string, value: any) => {
      span.tags = { ...span.tags, [key]: value };
    },
    setName: (newName: string) => {
      span.name = newName;
    }
  };
}

/**
 * Batch monitoring for bulk operations
 */
export class BatchMonitor {
  private operations: any[] = [];
  private startTime: number;

  constructor(private batchName: string) {
    this.startTime = Date.now();
  }

  addOperation(operation: any): void {
    this.operations.push({
      ...operation,
      timestamp: Date.now()
    });
  }

  complete(metadata?: Record<string, any>): void {
    const duration = Date.now() - this.startTime;

    monitoringService.recordApiRequest(
      'BATCH',
      this.batchName,
      200,
      duration,
      {
        operationCount: this.operations.length,
        ...metadata
      }
    );
  }
}

/**
 * Monitoring decorator for class methods
 */
export function Monitor(operation?: string) {
  return function(target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function(...args: any[]) {
      const opName = operation || `${target.constructor.name}.${propertyName}`;
      const requestId = monitoringService.startOperation(opName, {
        class: target.constructor.name,
        method: propertyName,
        args: args.length
      });

      try {
        const result = await originalMethod.apply(this, args);

        monitoringService.endOperation(requestId, {
          success: true
        });

        return result;
      } catch (error) {
        monitoringService.endOperation(requestId, {
          success: false,
          error: (error as Error).message
        });

        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Memory monitoring for detecting leaks
 */
export class MemoryMonitor {
  private snapshots: Map<string, any> = new Map();

  takeSnapshot(name: string): void {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      this.snapshots.set(name, process.memoryUsage());
    }
  }

  compareSnapshots(before: string, after: string): any {
    const beforeSnap = this.snapshots.get(before);
    const afterSnap = this.snapshots.get(after);

    if (!beforeSnap || !afterSnap) {
      return null;
    }

    return {
      heapUsedDiff: afterSnap.heapUsed - beforeSnap.heapUsed,
      externalDiff: afterSnap.external - beforeSnap.external,
      rssDiff: afterSnap.rss - beforeSnap.rss
    };
  }

  detectLeak(threshold: number = 10 * 1024 * 1024): boolean {
    const snapshots = Array.from(this.snapshots.values());
    if (snapshots.length < 2) return false;

    const recent = snapshots.slice(-5);
    const increasing = recent.every((snap, i) =>
      i === 0 || snap.heapUsed > recent[i - 1].heapUsed
    );

    const totalIncrease = recent[recent.length - 1].heapUsed - recent[0].heapUsed;

    return increasing && totalIncrease > threshold;
  }
}

/**
 * Export monitoring context for use in components
 */
export function useMonitoring() {
  return {
    startOperation: monitoringService.startOperation.bind(monitoringService),
    endOperation: monitoringService.endOperation.bind(monitoringService),
    recordError: monitoringService.recordError.bind(monitoringService),
    createSpan,
    BatchMonitor,
    MemoryMonitor
  };
}