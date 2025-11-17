/**
 * API endpoint for retrieving monitoring metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { monitoringService } from '@/lib/monitoring/monitoring-service';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const format = searchParams.get('format') || 'json';

    // Get metrics based on format
    if (format === 'prometheus') {
      const metrics = monitoringService.exportMetrics('prometheus');

      return new NextResponse(metrics, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; version=0.0.4',
        },
      });
    }

    // Default to JSON format
    const metrics = monitoringService.exportMetrics('json');
    const systemMetrics = monitoringService.getSystemMetrics();

    return NextResponse.json({
      success: true,
      timestamp: Date.now(),
      metrics,
      system: systemMetrics
    });

  } catch (error) {
    console.error('Failed to retrieve metrics:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve metrics',
        details: (error as Error).message
      },
      { status: 500 }
    );
  }
}