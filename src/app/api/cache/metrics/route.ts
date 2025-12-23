/**
 * Cache Metrics API
 * GET /api/cache/metrics - Returns cache performance metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMultiLayerCache } from '@/lib/cache/multi-layer-cache';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const cache = getMultiLayerCache();
    const format = request.nextUrl.searchParams.get('format');

    if (format === 'prometheus') {
      // Return Prometheus format metrics
      const prometheusMetrics = cache.exportMetrics();

      return new NextResponse(prometheusMetrics, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }

    // Return JSON format metrics
    const metrics = cache.getMetrics();
    const sizeInfo = cache.getSizeInfo();

    const response = {
      status: 'success',
      data: {
        metrics,
        size: sizeInfo,
        timestamp: new Date().toISOString(),
        performance: {
          expectedImprovement: '5-10x',
          l1Latency: '<1ms',
          l2Latency: '1-5ms',
          dbLatency: '10-100ms',
        },
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching cache metrics:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to fetch cache metrics',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}