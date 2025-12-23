/**
 * API endpoint for comprehensive dashboard data
 */

import { NextRequest, NextResponse } from 'next/server';
import { monitoringService } from '@/lib/monitoring/monitoring-service';
import { databaseMonitor } from '@/lib/monitoring/database-monitor';
import { AlertManager } from '@/lib/monitoring/alert-manager';

export const dynamic = 'force-dynamic';

const alertManager = (monitoringService as any).alertManager as AlertManager;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const hours = parseInt(searchParams.get('hours') || '24');

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

    // Fetch all data in parallel
    const [
      performanceSummary,
      systemMetrics,
      databaseMetrics,
      slowQueries,
      activeAlerts,
      alertStats,
      errorSummary
    ] = await Promise.all([
      monitoringService.getPerformanceSummary({ start: startTime, end: endTime }),
      monitoringService.getSystemMetrics(),
      databaseMonitor.exportMetrics(),
      monitoringService.getSlowQueries(10),
      alertManager.getActiveAlerts(),
      alertManager.getAlertStatistics(),
      monitoringService.getErrorSummary({ start: startTime, end: endTime })
    ]);

    // Calculate key metrics
    const keyMetrics = {
      apiRequests: performanceSummary.api?.count || 0,
      avgResponseTime: performanceSummary.api?.avgDuration || 0,
      errorRate: performanceSummary.api?.errorRate || 0,
      databaseQueries: performanceSummary.database?.count || 0,
      avgQueryTime: performanceSummary.database?.avgDuration || 0,
      slowQueryRate: performanceSummary.database?.slowQueryRate || 0,
      cacheHitRate: performanceSummary.cache?.hitRate || 0,
      queueJobs: performanceSummary.queue?.count || 0,
      queueSuccessRate: performanceSummary.queue?.successRate || 0,
      memoryUsage: systemMetrics.memory.usedPercent,
      cpuUsage: systemMetrics.cpu.usagePercent,
      activeAlertCount: activeAlerts.length,
      errorCount: errorSummary.total || 0
    };

    // Determine overall health status
    let healthStatus = 'healthy';
    if (keyMetrics.errorRate > 5 || keyMetrics.slowQueryRate > 20 ||
        keyMetrics.memoryUsage > 85 || keyMetrics.cpuUsage > 80 ||
        activeAlerts.some(a => a.severity === 'critical')) {
      healthStatus = 'unhealthy';
    } else if (keyMetrics.errorRate > 2 || keyMetrics.slowQueryRate > 10 ||
               keyMetrics.memoryUsage > 70 || keyMetrics.cpuUsage > 60 ||
               activeAlerts.some(a => a.severity === 'error')) {
      healthStatus = 'degraded';
    }

    // Build response
    const dashboardData = {
      success: true,
      timestamp: Date.now(),
      timeRange: {
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        hours
      },
      health: {
        status: healthStatus,
        uptime: process.uptime(),
        version: process.version
      },
      keyMetrics,
      performance: {
        api: performanceSummary.api,
        database: performanceSummary.database,
        cache: performanceSummary.cache,
        queue: performanceSummary.queue,
        operations: performanceSummary.operations
      },
      system: systemMetrics,
      database: {
        statistics: databaseMetrics.statistics,
        slowQueries: slowQueries.slice(0, 10),
        patterns: databaseMetrics.patterns?.slice(0, 5),
        poolStatus: databaseMetrics.poolStatus
      },
      alerts: {
        active: activeAlerts.slice(0, 10),
        statistics: alertStats
      },
      errors: {
        total: errorSummary.total,
        byType: errorSummary.byType,
        topErrors: errorSummary.topErrors?.slice(0, 5),
        timeline: errorSummary.timeline
      },
      charts: {
        // Data formatted for chart rendering
        apiResponseTime: formatTimeSeriesData(performanceSummary.api?.timeline),
        errorRate: formatTimeSeriesData(performanceSummary.api?.errorTimeline),
        queryPerformance: formatTimeSeriesData(performanceSummary.database?.timeline),
        cacheHitRate: formatTimeSeriesData(performanceSummary.cache?.timeline),
        systemResources: {
          memory: formatTimeSeriesData(performanceSummary.system?.memoryTimeline),
          cpu: formatTimeSeriesData(performanceSummary.system?.cpuTimeline)
        }
      }
    };

    return NextResponse.json(dashboardData);

  } catch (error) {
    console.error('Failed to retrieve dashboard data:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve dashboard data',
        details: (error as Error).message
      },
      { status: 500 }
    );
  }
}

// Helper function to format time series data for charts
function formatTimeSeriesData(timeline: any): any[] {
  if (!timeline || !Array.isArray(timeline)) return [];

  return timeline.map((point: any) => ({
    timestamp: point.timestamp,
    value: point.value || point.count || 0,
    label: new Date(point.timestamp).toLocaleTimeString()
  }));
}