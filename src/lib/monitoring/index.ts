/**
 * Main export file for monitoring utilities
 */

// Core monitoring service
export { monitoringService, MonitoringService } from './monitoring-service';

// Metrics
export {
  metrics,
  MetricsRegistry,
  httpRequestDuration,
  httpRequestTotal,
  httpRequestErrors,
  dbQueryDuration,
  dbQueryTotal,
  dbConnectionPoolSize,
  cacheHits,
  cacheMisses,
  queueJobsProcessed,
  queueJobsFailed,
  queueJobDuration,
  memoryUsage,
  cpuUsage,
  type Counter,
  type Gauge,
  type Histogram,
  type Summary
} from './metrics';

// Alert management
export {
  AlertManager,
  AlertType,
  AlertSeverity,
  type Alert
} from './alert-manager';

// Database monitoring
export {
  databaseMonitor,
  DatabaseMonitor,
  monitorDatabasePool,
  PostgreSQLMonitor
} from './database-monitor';

// Middleware and wrappers
export {
  performanceMiddleware,
  withMonitoring,
  expressMonitoringMiddleware,
  monitorQuery,
  monitorCache,
  monitorQueueJob,
  createSpan,
  BatchMonitor,
  MemoryMonitor,
  Monitor,
  useMonitoring,
  type MonitoringContext
} from './middleware';

// Performance store
export { PerformanceStore } from './performance-store';

// Convenience functions for common use cases

/**
 * Initialize monitoring for a Next.js application
 */
export function initializeMonitoring(config?: any) {
  // The monitoring service is already initialized as a singleton
  // This function can be used to apply custom configuration
  if (config) {
    console.log('Monitoring initialized with custom config:', config);
  }

  // Set up global error handler
  if (typeof window !== 'undefined') {
    window.addEventListener('error', (event) => {
      monitoringService.recordError(new Error(event.message), {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      monitoringService.recordError(new Error(event.reason), {
        type: 'unhandledRejection'
      });
    });
  }

  // Set up process error handlers in Node.js
  if (typeof process !== 'undefined') {
    process.on('uncaughtException', (error) => {
      monitoringService.recordError(error, {
        type: 'uncaughtException'
      });
    });

    process.on('unhandledRejection', (reason, promise) => {
      monitoringService.recordError(new Error(String(reason)), {
        type: 'unhandledRejection',
        promise
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down monitoring...');
      monitoringService.shutdown();
    });

    process.on('SIGINT', () => {
      console.log('SIGINT received, shutting down monitoring...');
      monitoringService.shutdown();
    });
  }

  return monitoringService;
}

/**
 * Get current monitoring status
 */
export function getMonitoringStatus() {
  const systemMetrics = monitoringService.getSystemMetrics();
  const dbStats = databaseMonitor.getQueryStatistics();

  return {
    system: {
      memory: `${systemMetrics.memory.usedPercent.toFixed(1)}%`,
      cpu: `${systemMetrics.cpu.usagePercent.toFixed(1)}%`,
      uptime: process.uptime()
    },
    database: {
      activeQueries: dbStats.activeQueries,
      avgQueryTime: `${dbStats.avgDuration?.toFixed(0) || 0}ms`,
      slowQueryRate: `${dbStats.slowRate?.toFixed(1) || 0}%`
    },
    metrics: metrics.getMetrics()
  };
}

/**
 * Export metrics in various formats
 */
export function exportMetrics(format: 'json' | 'prometheus' = 'json') {
  return monitoringService.exportMetrics(format);
}

/**
 * Quick health check
 */
export async function healthCheck() {
  const systemMetrics = monitoringService.getSystemMetrics();

  const isHealthy =
    systemMetrics.memory.usedPercent < 90 &&
    systemMetrics.cpu.usagePercent < 90;

  return {
    healthy: isHealthy,
    memory: systemMetrics.memory.usedPercent,
    cpu: systemMetrics.cpu.usagePercent,
    timestamp: Date.now()
  };
}