/**
 * ML Metrics API Endpoint
 * Provides real-time ML performance metrics and monitoring data
 */

import { NextRequest, NextResponse } from 'next/server';
import { mlMetricsDashboard, predictiveCacheManager, inferenceEngine } from '@/lib/ml';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') as 'json' | 'prometheus' | null;
    const duration = searchParams.get('duration');

    // Get comprehensive metrics
    const metrics = await getComprehensiveMetrics(duration ? parseInt(duration) : undefined);

    // Format based on request
    if (format === 'prometheus') {
      const prometheusMetrics = mlMetricsDashboard.exportMetrics('prometheus');

      return new NextResponse(prometheusMetrics, {
        headers: {
          'Content-Type': 'text/plain; version=0.0.4',
        },
      });
    }

    return NextResponse.json({
      success: true,
      metrics,
      timestamp: Date.now(),
    });

  } catch (error) {
    console.error('Metrics API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve metrics',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * Get comprehensive ML metrics
 */
async function getComprehensiveMetrics(duration?: number): Promise<any> {
  // Get dashboard summary
  const dashboardSummary = mlMetricsDashboard.getMetricsSummary();

  // Get predictive cache metrics
  const cacheMetrics = predictiveCacheManager.getMetrics();

  // Get inference engine metrics
  const inferenceMetrics = inferenceEngine.getMetrics();

  // Get historical data if duration specified
  const history = duration
    ? mlMetricsDashboard.getMetricsHistory(duration)
    : undefined;

  // Calculate additional insights
  const insights = calculateInsights(dashboardSummary, cacheMetrics);

  return {
    current: dashboardSummary.current,
    averages: dashboardSummary.averages,
    trends: dashboardSummary.trends,
    alerts: dashboardSummary.alerts,
    cache: {
      hitRate: cacheMetrics.cacheMetrics?.overall?.overallHitRate || 0,
      predictiveHitRate: calculatePredictiveHitRate(cacheMetrics),
      preloadedItems: cacheMetrics.preloadedItems,
      warmingTasks: cacheMetrics.warmingTasks,
      memoryUsedMB: cacheMetrics.memoryUsed,
      efficiency: calculateEfficiency(cacheMetrics),
    },
    inference: {
      totalPredictions: inferenceMetrics.totalPredictions,
      cacheHitRate: inferenceMetrics.cacheHitRate,
      avgLatencyMs: inferenceMetrics.avgLatency,
      modelLoadTimeMs: inferenceMetrics.modelLoadTime,
      ready: inferenceMetrics.ready,
      warmupComplete: inferenceMetrics.warmupComplete,
      modelVersions: inferenceMetrics.modelVersions,
    },
    insights,
    history,
  };
}

/**
 * Calculate predictive hit rate
 */
function calculatePredictiveHitRate(metrics: any): number {
  const total = metrics.predictiveHits + metrics.predictiveMisses;
  return total > 0 ? metrics.predictiveHits / total : 0;
}

/**
 * Calculate cache efficiency
 */
function calculateEfficiency(metrics: any): {
  preloadEfficiency: number;
  cacheImprovement: number;
  coldStartReduction: number;
} {
  const preloadEfficiency = metrics.preloadedItems > 0
    ? (metrics.predictiveHits / metrics.preloadedItems) * 100
    : 0;

  const baseline = 0.95; // Baseline cache hit rate
  const current = calculatePredictiveHitRate(metrics);
  const cacheImprovement = ((current - baseline) / baseline) * 100;

  const coldStartReduction = Math.min(90, Math.max(0, cacheImprovement * 3));

  return {
    preloadEfficiency,
    cacheImprovement: Math.max(0, cacheImprovement),
    coldStartReduction,
  };
}

/**
 * Calculate additional insights
 */
function calculateInsights(summary: any, cacheMetrics: any): any {
  const insights: any = {
    performance: 'normal',
    recommendations: [],
    optimization: {},
  };

  // Determine performance level
  if (summary.averages.accuracy > 0.9 && summary.averages.hitRate > 0.97) {
    insights.performance = 'excellent';
  } else if (summary.averages.accuracy > 0.8 && summary.averages.hitRate > 0.95) {
    insights.performance = 'good';
  } else if (summary.averages.accuracy < 0.7 || summary.averages.hitRate < 0.9) {
    insights.performance = 'poor';
  }

  // Generate recommendations
  if (summary.trends.accuracyTrend === 'down') {
    insights.recommendations.push('Model accuracy declining - consider retraining');
  }

  if (summary.trends.latencyTrend === 'up') {
    insights.recommendations.push('Prediction latency increasing - optimize model or infrastructure');
  }

  if (cacheMetrics.preloadedItems > 100) {
    insights.recommendations.push('High preload count - consider more selective prediction threshold');
  }

  // Calculate optimization opportunities
  const currentHitRate = cacheMetrics.cacheMetrics?.overall?.overallHitRate || 0.95;
  const potentialHitRate = Math.min(0.995, currentHitRate + 0.03);
  const potentialImprovement = ((potentialHitRate - currentHitRate) / currentHitRate) * 100;

  insights.optimization = {
    currentHitRate: (currentHitRate * 100).toFixed(1) + '%',
    potentialHitRate: (potentialHitRate * 100).toFixed(1) + '%',
    potentialImprovement: potentialImprovement.toFixed(1) + '%',
    estimatedCostSavings: (potentialImprovement * 100).toFixed(2) + ' USD/month',
  };

  return insights;
}