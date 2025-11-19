/**
 * Main monitoring service that orchestrates all performance monitoring
 */

import { EventEmitter } from 'events';
import * as os from 'os';
import { performance } from 'perf_hooks';
import { metrics, memoryUsage, cpuUsage } from './metrics';
import { AlertManager } from './alert-manager';
import { PerformanceStore } from './performance-store';
import { log } from '@/lib/logger';

export interface MonitoringConfig {
  enabled: boolean;
  sampleRate: number; // 0-1, percentage of requests to sample
  slowQueryThreshold: number; // ms
  slowApiThreshold: number; // ms
  errorRateThreshold: number; // percentage
  memoryThreshold: number; // percentage
  cpuThreshold: number; // percentage
  retentionDays: number; // how long to keep historical data
}

export interface PerformanceContext {
  requestId: string;
  userId?: string;
  sessionId?: string;
  operation: string;
  startTime: number;
  metadata?: Record<string, any>;
}

export interface PerformanceSpan {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  tags?: Record<string, any>;
  children?: PerformanceSpan[];
}

class MonitoringService extends EventEmitter {
  private config: MonitoringConfig;
  private contexts: Map<string, PerformanceContext> = new Map();
  private spans: Map<string, PerformanceSpan[]> = new Map();
  private alertManager: AlertManager;
  private performanceStore: PerformanceStore;
  private systemMonitorInterval?: NodeJS.Timeout;
  private metricsAggregationInterval?: NodeJS.Timeout;

  constructor(config?: Partial<MonitoringConfig>) {
    super();

    this.config = {
      enabled: process.env.NODE_ENV === 'production' || process.env.MONITORING_ENABLED === 'true',
      sampleRate: parseFloat(process.env.MONITORING_SAMPLE_RATE || '1.0'),
      slowQueryThreshold: parseInt(process.env.SLOW_QUERY_THRESHOLD || '100'),
      slowApiThreshold: parseInt(process.env.SLOW_API_THRESHOLD || '1000'),
      errorRateThreshold: parseFloat(process.env.ERROR_RATE_THRESHOLD || '5'),
      memoryThreshold: parseFloat(process.env.MEMORY_THRESHOLD || '85'),
      cpuThreshold: parseFloat(process.env.CPU_THRESHOLD || '80'),
      retentionDays: parseInt(process.env.METRICS_RETENTION_DAYS || '30'),
      ...config
    };

    this.alertManager = new AlertManager(this.config);
    this.performanceStore = new PerformanceStore(this.config);

    if (this.config.enabled) {
      this.startSystemMonitoring();
      this.startMetricsAggregation();
    }
  }

  /**
   * Start monitoring a new operation
   */
  startOperation(operation: string, metadata?: Record<string, any>): string {
    if (!this.shouldSample()) return '';

    const requestId = this.generateRequestId();
    const context: PerformanceContext = {
      requestId,
      operation,
      startTime: performance.now(),
      metadata
    };

    this.contexts.set(requestId, context);
    this.spans.set(requestId, []);

    return requestId;
  }

  /**
   * End monitoring an operation
   */
  endOperation(requestId: string, metadata?: Record<string, any>): void {
    const context = this.contexts.get(requestId);
    if (!context) return;

    const duration = performance.now() - context.startTime;
    const spans = this.spans.get(requestId) || [];

    // Store performance data
    this.performanceStore.store({
      requestId,
      operation: context.operation,
      duration,
      spans,
      metadata: { ...context.metadata, ...metadata },
      timestamp: Date.now()
    });

    // Check for slow operations
    if (context.operation.startsWith('api.') && duration > this.config.slowApiThreshold) {
      this.alertManager.checkSlowApi(context.operation, duration);
    }

    // Cleanup
    this.contexts.delete(requestId);
    this.spans.delete(requestId);

    // Emit event for listeners
    this.emit('operation:complete', {
      requestId,
      operation: context.operation,
      duration,
      spans
    });
  }

  /**
   * Start a span within an operation
   */
  startSpan(requestId: string, spanName: string, tags?: Record<string, any>): PerformanceSpan {
    const span: PerformanceSpan = {
      name: spanName,
      startTime: performance.now(),
      tags,
      children: []
    };

    const spans = this.spans.get(requestId) || [];
    spans.push(span);
    this.spans.set(requestId, spans);

    return span;
  }

  /**
   * End a span
   */
  endSpan(span: PerformanceSpan): void {
    span.endTime = performance.now();
    span.duration = span.endTime - span.startTime;

    // Check if it's a database query span
    if (span.name.startsWith('db.') && span.duration > this.config.slowQueryThreshold) {
      this.alertManager.checkSlowQuery(span.name, span.duration, span.tags);
    }
  }

  /**
   * Record a database query
   */
  recordQuery(query: string, duration: number, metadata?: Record<string, any>): void {
    if (!this.shouldSample()) return;

    // Update metrics
    metrics.getMetrics()['db_query_duration_seconds'].observe(duration / 1000);
    metrics.getMetrics()['db_queries_total'].inc(1, {
      type: metadata?.type || 'unknown'
    });

    // Check for slow queries
    if (duration > this.config.slowQueryThreshold) {
      this.alertManager.checkSlowQuery(query, duration, metadata);

      // Log slow query
      log.warn('[SLOW_QUERY]', {
        query: query.substring(0, 200),
        duration,
        ...metadata
      });
    }

    // Store query performance
    this.performanceStore.storeQuery({
      query,
      duration,
      metadata,
      timestamp: Date.now()
    });
  }

  /**
   * Record an API request
   */
  recordApiRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    metadata?: Record<string, any>
  ): void {
    if (!this.shouldSample()) return;

    // Update metrics
    metrics.getMetrics()['http_request_duration_seconds'].observe(duration / 1000, {
      method,
      path,
      status: statusCode.toString()
    });

    metrics.getMetrics()['http_requests_total'].inc(1, {
      method,
      path,
      status: statusCode.toString()
    });

    if (statusCode >= 400) {
      metrics.getMetrics()['http_request_errors_total'].inc(1, {
        method,
        path,
        status: statusCode.toString()
      });
    }

    // Check for slow APIs
    if (duration > this.config.slowApiThreshold) {
      this.alertManager.checkSlowApi(`${method} ${path}`, duration);
    }

    // Store API performance
    this.performanceStore.storeApiRequest({
      method,
      path,
      statusCode,
      duration,
      metadata,
      timestamp: Date.now()
    });
  }

  /**
   * Record cache operation
   */
  recordCacheOperation(hit: boolean, key: string, metadata?: Record<string, any>): void {
    if (hit) {
      metrics.getMetrics()['cache_hits_total'].inc(1, { key });
    } else {
      metrics.getMetrics()['cache_misses_total'].inc(1, { key });
    }

    this.performanceStore.storeCacheOperation({
      hit,
      key,
      metadata,
      timestamp: Date.now()
    });
  }

  /**
   * Record queue job
   */
  recordQueueJob(
    jobName: string,
    success: boolean,
    duration: number,
    metadata?: Record<string, any>
  ): void {
    metrics.getMetrics()['queue_job_duration_seconds'].observe(duration / 1000, {
      job: jobName,
      status: success ? 'success' : 'failed'
    });

    if (success) {
      metrics.getMetrics()['queue_jobs_processed_total'].inc(1, { job: jobName });
    } else {
      metrics.getMetrics()['queue_jobs_failed_total'].inc(1, { job: jobName });
    }

    this.performanceStore.storeQueueJob({
      jobName,
      success,
      duration,
      metadata,
      timestamp: Date.now()
    });
  }

  /**
   * Record an error
   */
  recordError(error: Error, context?: Record<string, any>): void {
    this.alertManager.checkError(error, context);

    this.performanceStore.storeError({
      name: error.name,
      message: error.message,
      stack: error.stack,
      context,
      timestamp: Date.now()
    });
  }

  /**
   * Get current system metrics
   */
  getSystemMetrics() {
    const memTotal = os.totalmem();
    const memFree = os.freemem();
    const memUsedPercent = ((memTotal - memFree) / memTotal) * 100;

    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    });

    const cpuUsagePercent = 100 - ~~(100 * totalIdle / totalTick);

    return {
      memory: {
        total: memTotal,
        free: memFree,
        used: memTotal - memFree,
        usedPercent: memUsedPercent
      },
      cpu: {
        cores: cpus.length,
        usagePercent: cpuUsagePercent,
        loadAvg: os.loadavg()
      },
      uptime: process.uptime(),
      platform: os.platform(),
      nodeVersion: process.version
    };
  }

  /**
   * Start monitoring system resources
   */
  private startSystemMonitoring(): void {
    this.systemMonitorInterval = setInterval(() => {
      const systemMetrics = this.getSystemMetrics();

      // Update gauges
      memoryUsage.set(systemMetrics.memory.used);
      cpuUsage.set(systemMetrics.cpu.usagePercent);

      // Check thresholds
      if (systemMetrics.memory.usedPercent > this.config.memoryThreshold) {
        this.alertManager.checkMemoryUsage(systemMetrics.memory.usedPercent);
      }

      if (systemMetrics.cpu.usagePercent > this.config.cpuThreshold) {
        this.alertManager.checkCpuUsage(systemMetrics.cpu.usagePercent);
      }

      // Store system metrics
      this.performanceStore.storeSystemMetrics(systemMetrics);
    }, 10000); // Every 10 seconds
  }

  /**
   * Start aggregating metrics
   */
  private startMetricsAggregation(): void {
    this.metricsAggregationInterval = setInterval(async () => {
      try {
        await this.performanceStore.aggregate();
        await this.performanceStore.cleanup(this.config.retentionDays);
      } catch (error) {
        log.error('Failed to aggregate metrics:', error);
      }
    }, 60000); // Every minute
  }

  /**
   * Determine if we should sample this request
   */
  private shouldSample(): boolean {
    if (!this.config.enabled) return false;
    return Math.random() < this.config.sampleRate;
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Get performance summary
   */
  async getPerformanceSummary(timeRange: { start: Date; end: Date }) {
    return this.performanceStore.getSummary(timeRange);
  }

  /**
   * Get slow queries
   */
  async getSlowQueries(limit: number = 100) {
    return this.performanceStore.getSlowQueries(limit);
  }

  /**
   * Get error summary
   */
  async getErrorSummary(timeRange: { start: Date; end: Date }) {
    return this.performanceStore.getErrorSummary(timeRange);
  }

  /**
   * Export metrics in various formats
   */
  exportMetrics(format: 'json' | 'prometheus' = 'json') {
    if (format === 'prometheus') {
      return metrics.toPrometheus();
    }
    return metrics.getMetrics();
  }

  /**
   * Cleanup and shutdown
   */
  shutdown(): void {
    if (this.systemMonitorInterval) {
      clearInterval(this.systemMonitorInterval);
    }
    if (this.metricsAggregationInterval) {
      clearInterval(this.metricsAggregationInterval);
    }
    this.performanceStore.close();
  }
}

// Export singleton instance
export const monitoringService = new MonitoringService();

// Export for testing and custom configurations
export { MonitoringService };