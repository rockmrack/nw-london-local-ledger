/**
 * API endpoint for performance monitoring dashboard data
 */

import { NextRequest, NextResponse } from 'next/server';
import { monitoringService } from '@/lib/monitoring/monitoring-service';
import { databaseMonitor } from '@/lib/monitoring/database-monitor';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse time range
    const hours = parseInt(searchParams.get('hours') || '24');
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

    // Get performance summary
    const performanceSummary = await monitoringService.getPerformanceSummary({
      start: startTime,
      end: endTime
    });

    // Get database metrics
    const databaseMetrics = databaseMonitor.exportMetrics();

    // Get slow queries
    const slowQueries = await monitoringService.getSlowQueries(50);

    // Get system metrics
    const systemMetrics = monitoringService.getSystemMetrics();

    return NextResponse.json({
      success: true,
      timeRange: {
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        hours
      },
      summary: performanceSummary,
      database: databaseMetrics,
      slowQueries,
      system: systemMetrics,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Failed to retrieve performance data:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve performance data',
        details: (error as Error).message
      },
      { status: 500 }
    );
  }
}