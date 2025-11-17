/**
 * Edge Cache Metrics API
 * Provides metrics for Cloudflare edge caching performance
 */

import { NextRequest, NextResponse } from 'next/server';

// Mock metrics for development (replace with actual Cloudflare API calls in production)
async function getCloudflareMetrics() {
  // In production, fetch from Cloudflare Analytics API
  // const response = await fetch(
  //   `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/analytics/dashboard`,
  //   {
  //     headers: {
  //       'Authorization': `Bearer ${CF_API_TOKEN}`,
  //     },
  //   }
  // );

  // Mock data for demonstration
  return {
    hitRate: 0.94,
    missRate: 0.06,
    avgLatency: 45,
    bandwidth: {
      saved: 1073741824 * 2.5, // 2.5 GB
      total: 1073741824 * 3,    // 3 GB
    },
    locations: 200,
    requests: {
      cached: 950000,
      uncached: 50000,
      total: 1000000,
    },
    performance: {
      originLatency: 250,
      edgeLatency: 45,
      improvement: 5.5,
    },
    geographical: {
      'North America': { requests: 400000, avgLatency: 35 },
      'Europe': { requests: 350000, avgLatency: 40 },
      'Asia': { requests: 200000, avgLatency: 60 },
      'Other': { requests: 50000, avgLatency: 80 },
    },
    topPaths: [
      { path: '/api/properties', requests: 250000, hitRate: 0.96 },
      { path: '/api/planning', requests: 200000, hitRate: 0.92 },
      { path: '/api/areas', requests: 150000, hitRate: 0.98 },
      { path: '/_next/static', requests: 100000, hitRate: 1.0 },
      { path: '/images', requests: 80000, hitRate: 0.99 },
    ],
    cacheStatus: {
      HIT: 850000,
      MISS: 60000,
      EXPIRED: 30000,
      STALE: 40000,
      BYPASS: 20000,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'summary';

    if (type === 'edge') {
      // Get edge cache specific metrics
      const metrics = await getCloudflareMetrics();

      return NextResponse.json({
        hitRate: metrics.hitRate,
        missRate: metrics.missRate,
        avgLatency: metrics.avgLatency,
        bandwidth: metrics.bandwidth,
        locations: metrics.locations,
        timestamp: Date.now(),
      });
    }

    // Get comprehensive metrics
    const metrics = await getCloudflareMetrics();

    // Calculate additional metrics
    const effectiveHitRate = metrics.requests.cached / metrics.requests.total;
    const bandwidthSavingRate = metrics.bandwidth.saved / metrics.bandwidth.total;
    const latencyReduction =
      (metrics.performance.originLatency - metrics.performance.edgeLatency) /
      metrics.performance.originLatency;

    return NextResponse.json({
      summary: {
        effectiveHitRate,
        bandwidthSavingRate,
        latencyReduction,
        performanceGain: metrics.performance.improvement,
        globalLocations: metrics.locations,
      },
      requests: metrics.requests,
      performance: metrics.performance,
      bandwidth: metrics.bandwidth,
      geographical: metrics.geographical,
      topPaths: metrics.topPaths,
      cacheStatus: metrics.cacheStatus,
      recommendations: generateRecommendations(metrics),
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Failed to fetch edge cache metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    );
  }
}

function generateRecommendations(metrics: any) {
  const recommendations = [];

  // Check hit rate
  if (metrics.hitRate < 0.9) {
    recommendations.push({
      priority: 'high',
      type: 'cache-optimization',
      message: 'Cache hit rate is below 90%. Consider increasing TTLs or implementing cache warming.',
      impact: 'Could improve performance by 20-30%',
    });
  }

  // Check geographical distribution
  const geoValues = Object.values(metrics.geographical) as any[];
  const avgGeoLatency = geoValues.reduce((sum, geo) => sum + geo.avgLatency, 0) / geoValues.length;
  if (avgGeoLatency > 50) {
    recommendations.push({
      priority: 'medium',
      type: 'geographic-routing',
      message: 'Average global latency exceeds 50ms. Consider enabling Argo Smart Routing.',
      impact: 'Could reduce latency by 30%',
    });
  }

  // Check bandwidth savings
  const savingRate = metrics.bandwidth.saved / metrics.bandwidth.total;
  if (savingRate < 0.8) {
    recommendations.push({
      priority: 'medium',
      type: 'bandwidth-optimization',
      message: 'Bandwidth savings below 80%. Review cache headers and enable compression.',
      impact: 'Could save additional 15-20% bandwidth',
    });
  }

  // Check cache status distribution
  const bypassRate = metrics.cacheStatus.BYPASS / metrics.requests.total;
  if (bypassRate > 0.05) {
    recommendations.push({
      priority: 'low',
      type: 'cache-bypass',
      message: 'High cache bypass rate detected. Review bypass rules and conditions.',
      impact: 'Could improve hit rate by 3-5%',
    });
  }

  // Check top paths performance
  const poorPerformingPaths = metrics.topPaths.filter((p: any) => p.hitRate < 0.9);
  if (poorPerformingPaths.length > 0) {
    recommendations.push({
      priority: 'medium',
      type: 'path-optimization',
      message: `${poorPerformingPaths.length} paths have hit rates below 90%. Review cache rules for these paths.`,
      paths: poorPerformingPaths.map((p: any) => p.path),
      impact: 'Could improve overall hit rate by 5-10%',
    });
  }

  return recommendations;
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();

    if (action === 'reset') {
      // Reset metrics collection
      // In production, this would trigger a new analytics period
      return NextResponse.json({ success: true, message: 'Metrics reset' });
    }

    if (action === 'warmup') {
      // Trigger cache warmup
      // In production, this would call the cache warming worker
      return NextResponse.json({
        success: true,
        message: 'Cache warmup initiated',
        urls: [
          '/api/properties',
          '/api/planning',
          '/api/areas',
        ],
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}