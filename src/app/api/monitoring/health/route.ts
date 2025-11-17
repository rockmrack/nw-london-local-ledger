/**
 * API endpoint for system health checks
 */

import { NextRequest, NextResponse } from 'next/server';
import { monitoringService } from '@/lib/monitoring/monitoring-service';
import { databaseMonitor } from '@/lib/monitoring/database-monitor';
import { AlertManager } from '@/lib/monitoring/alert-manager';

// Access alert manager through monitoring service
const alertManager = (monitoringService as any).alertManager as AlertManager;

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    [key: string]: {
      status: 'pass' | 'warn' | 'fail';
      message?: string;
      value?: any;
      threshold?: any;
    };
  };
}

export async function GET(request: NextRequest) {
  try {
    const healthStatus: HealthStatus = {
      status: 'healthy',
      checks: {}
    };

    // Get system metrics
    const systemMetrics = monitoringService.getSystemMetrics();

    // Check memory usage
    healthStatus.checks.memory = {
      status: 'pass',
      value: systemMetrics.memory.usedPercent.toFixed(1),
      threshold: 85
    };

    if (systemMetrics.memory.usedPercent > 85) {
      healthStatus.checks.memory.status = 'warn';
      healthStatus.status = 'degraded';
      healthStatus.checks.memory.message = 'High memory usage';
    }

    if (systemMetrics.memory.usedPercent > 95) {
      healthStatus.checks.memory.status = 'fail';
      healthStatus.status = 'unhealthy';
      healthStatus.checks.memory.message = 'Critical memory usage';
    }

    // Check CPU usage
    healthStatus.checks.cpu = {
      status: 'pass',
      value: systemMetrics.cpu.usagePercent.toFixed(1),
      threshold: 80
    };

    if (systemMetrics.cpu.usagePercent > 80) {
      healthStatus.checks.cpu.status = 'warn';
      healthStatus.status = 'degraded';
      healthStatus.checks.cpu.message = 'High CPU usage';
    }

    if (systemMetrics.cpu.usagePercent > 95) {
      healthStatus.checks.cpu.status = 'fail';
      healthStatus.status = 'unhealthy';
      healthStatus.checks.cpu.message = 'Critical CPU usage';
    }

    // Check database
    const dbStats = databaseMonitor.getQueryStatistics();
    healthStatus.checks.database = {
      status: 'pass',
      value: {
        activeQueries: dbStats.activeQueries,
        slowRate: dbStats.slowRate?.toFixed(1) || 0
      }
    };

    if (dbStats.slowRate > 10) {
      healthStatus.checks.database.status = 'warn';
      healthStatus.status = 'degraded';
      healthStatus.checks.database.message = 'High slow query rate';
    }

    if (dbStats.activeQueries > 50) {
      healthStatus.checks.database.status = 'fail';
      healthStatus.status = 'unhealthy';
      healthStatus.checks.database.message = 'Too many active queries';
    }

    // Check active alerts
    const activeAlerts = alertManager.getActiveAlerts();
    healthStatus.checks.alerts = {
      status: 'pass',
      value: activeAlerts.length
    };

    const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical');
    const errorAlerts = activeAlerts.filter(a => a.severity === 'error');

    if (errorAlerts.length > 0) {
      healthStatus.checks.alerts.status = 'warn';
      healthStatus.status = 'degraded';
      healthStatus.checks.alerts.message = `${errorAlerts.length} error alerts active`;
    }

    if (criticalAlerts.length > 0) {
      healthStatus.checks.alerts.status = 'fail';
      healthStatus.status = 'unhealthy';
      healthStatus.checks.alerts.message = `${criticalAlerts.length} critical alerts active`;
    }

    // Get recent performance summary
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 5 * 60 * 1000); // Last 5 minutes

    const performanceSummary = await monitoringService.getPerformanceSummary({
      start: startTime,
      end: endTime
    });

    // Check API performance
    healthStatus.checks.api = {
      status: 'pass',
      value: {
        avgDuration: performanceSummary.api?.avgDuration?.toFixed(0) || 0,
        errorRate: performanceSummary.api?.errorRate?.toFixed(1) || 0
      }
    };

    if (performanceSummary.api?.avgDuration > 1000) {
      healthStatus.checks.api.status = 'warn';
      healthStatus.status = 'degraded';
      healthStatus.checks.api.message = 'Slow API response times';
    }

    if (performanceSummary.api?.errorRate > 5) {
      healthStatus.checks.api.status = 'fail';
      healthStatus.status = 'unhealthy';
      healthStatus.checks.api.message = 'High API error rate';
    }

    // Check cache performance
    healthStatus.checks.cache = {
      status: 'pass',
      value: {
        hitRate: performanceSummary.cache?.hitRate?.toFixed(1) || 0
      }
    };

    if (performanceSummary.cache?.hitRate < 70) {
      healthStatus.checks.cache.status = 'warn';
      healthStatus.checks.cache.message = 'Low cache hit rate';
    }

    // Return health status
    const statusCode = healthStatus.status === 'healthy' ? 200 :
                      healthStatus.status === 'degraded' ? 200 : 503;

    return NextResponse.json({
      ...healthStatus,
      timestamp: Date.now(),
      uptime: process.uptime(),
      activeAlerts: activeAlerts.map(a => ({
        type: a.type,
        severity: a.severity,
        title: a.title
      }))
    }, { status: statusCode });

  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json(
      {
        status: 'unhealthy',
        checks: {
          system: {
            status: 'fail',
            message: 'Health check failed',
            error: (error as Error).message
          }
        },
        timestamp: Date.now()
      },
      { status: 503 }
    );
  }
}