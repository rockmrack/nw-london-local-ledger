/**
 * Cache Warming API
 * POST /api/cache/warm - Trigger cache warming
 */

import { NextRequest, NextResponse } from 'next/server';
import { CacheWarmer } from '@/lib/cache/cache-warmer';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { strategies, immediate = false } = body;

    const warmer = new CacheWarmer();

    // Check if already warming
    if (warmer.isWarmingInProgress()) {
      return NextResponse.json({
        status: 'info',
        message: 'Cache warming already in progress',
        inProgress: true,
      });
    }

    if (immediate) {
      // Immediate warming (blocking)
      await warmer.warmAll();

      const stats = warmer.getStats();
      return NextResponse.json({
        status: 'success',
        message: 'Cache warming completed',
        stats,
        timestamp: new Date().toISOString(),
      });
    } else {
      // Queue warming job (non-blocking)
      try {
        const { QueueService } = await import('@/lib/queues/services/queue.service');
        const queueService = QueueService.getInstance();

        const jobId = await queueService.addJob(
          'cache',
          'warm',
          {
            strategies: strategies || [],
            timestamp: new Date().toISOString(),
          },
          {
            priority: body.priority || 3,
          }
        );

        return NextResponse.json({
          status: 'success',
          message: 'Cache warming job queued',
          jobId,
          timestamp: new Date().toISOString(),
        });
      } catch (queueError) {
        // Fallback to immediate warming if queue not available
        console.warn('Queue not available, using immediate warming');
        await warmer.warmAll();

        const stats = warmer.getStats();
        return NextResponse.json({
          status: 'success',
          message: 'Cache warming completed (immediate fallback)',
          stats,
          timestamp: new Date().toISOString(),
        });
      }
    }
  } catch (error) {
    console.error('Cache warming error:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to warm cache',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const warmer = new CacheWarmer();
    const stats = warmer.getStats();
    const isWarming = warmer.isWarmingInProgress();

    // Get available strategies
    const strategies = [
      {
        name: 'recent-properties',
        description: 'Warm recent property listings',
        priority: 1,
        ttl: 3600,
      },
      {
        name: 'popular-areas',
        description: 'Warm popular area statistics',
        priority: 2,
        ttl: 7200,
      },
      {
        name: 'active-planning',
        description: 'Warm active planning applications',
        priority: 3,
        ttl: 3600,
      },
      {
        name: 'top-schools',
        description: 'Warm top-rated schools',
        priority: 4,
        ttl: 86400,
      },
      {
        name: 'transport-stations',
        description: 'Warm transport station data',
        priority: 5,
        ttl: 86400,
      },
      {
        name: 'council-tax-bands',
        description: 'Warm council tax band information',
        priority: 6,
        ttl: 86400,
      },
      {
        name: 'crime-stats',
        description: 'Warm crime statistics',
        priority: 7,
        ttl: 86400,
      },
    ];

    return NextResponse.json({
      status: 'success',
      data: {
        isWarming,
        stats,
        availableStrategies: strategies,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error getting cache warming status:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to get warming status',
      },
      { status: 500 }
    );
  }
}