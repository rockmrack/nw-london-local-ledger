/**
 * ML Metrics Dashboard
 * Real-time monitoring of ML-powered predictive caching performance
 */

import { predictiveCacheManager } from '../predictive-cache-manager';
import { inferenceEngine } from '../inference/inference-engine';
import { trainingPipeline } from '../training/training-pipeline';

export interface MLDashboardMetrics {
  timestamp: number;
  predictions: {
    total: number;
    accuracy: number;
    latency: {
      p50: number;
      p95: number;
      p99: number;
    };
  };
  cache: {
    hitRate: number;
    predictiveHitRate: number;
    preloadedItems: number;
    warmingQueueSize: number;
    memoryUsageMB: number;
  };
  models: {
    versions: Record<string, string>;
    lastTraining: number;
    nextTraining: number;
    performance: Record<string, any>;
  };
  efficiency: {
    cacheImprovement: number;
    coldStartReduction: number;
    preloadEfficiency: number;
    costSavings: number;
  };
}

export interface AlertConfig {
  accuracyThreshold: number;
  latencyThresholdMs: number;
  hitRateThreshold: number;
  memoryThresholdMB: number;
}

export class MLMetricsDashboard {
  private metricsHistory: MLDashboardMetrics[] = [];
  private readonly maxHistorySize = 1000;
  private alertConfig: AlertConfig;
  private activeAlerts = new Set<string>();
  private metricsInterval: NodeJS.Timeout | null = null;

  constructor(alertConfig?: Partial<AlertConfig>) {
    this.alertConfig = {
      accuracyThreshold: 0.75,
      latencyThresholdMs: 10,
      hitRateThreshold: 0.95,
      memoryThresholdMB: 90,
      ...alertConfig,
    };

    // Start metrics collection
    this.startMetricsCollection();
  }

  /**
   * Start collecting metrics
   */
  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, 10000); // Collect every 10 seconds
  }

  /**
   * Collect current metrics
   */
  private async collectMetrics(): Promise<void> {
    const metrics = await this.gatherMetrics();

    // Add to history
    this.metricsHistory.push(metrics);

    // Trim history if needed
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory = this.metricsHistory.slice(-this.maxHistorySize);
    }

    // Check for alerts
    this.checkAlerts(metrics);

    // Log summary
    this.logMetricsSummary(metrics);
  }

  /**
   * Gather all metrics
   */
  private async gatherMetrics(): Promise<MLDashboardMetrics> {
    const predictiveMetrics = predictiveCacheManager.getMetrics();
    const inferenceMetrics = inferenceEngine.getMetrics();

    // Calculate latency percentiles
    const latencies = this.getLatencyPercentiles();

    // Calculate efficiency metrics
    const efficiency = this.calculateEfficiency();

    return {
      timestamp: Date.now(),
      predictions: {
        total: inferenceMetrics.totalPredictions,
        accuracy: this.calculateAccuracy(),
        latency: latencies,
      },
      cache: {
        hitRate: predictiveMetrics.cacheMetrics?.overall?.overallHitRate || 0,
        predictiveHitRate: this.calculatePredictiveHitRate(predictiveMetrics),
        preloadedItems: predictiveMetrics.preloadedItems,
        warmingQueueSize: predictiveMetrics.warmingTasks,
        memoryUsageMB: predictiveMetrics.memoryUsed,
      },
      models: {
        versions: Object.fromEntries(inferenceMetrics.modelVersions),
        lastTraining: this.getLastTrainingTime(),
        nextTraining: this.getNextTrainingTime(),
        performance: await this.getModelPerformance(),
      },
      efficiency,
    };
  }

  /**
   * Calculate prediction accuracy
   */
  private calculateAccuracy(): number {
    const predictiveMetrics = predictiveCacheManager.getMetrics();
    const hits = predictiveMetrics.predictiveHits;
    const total = hits + predictiveMetrics.predictiveMisses;
    return total > 0 ? hits / total : 0;
  }

  /**
   * Calculate predictive hit rate
   */
  private calculatePredictiveHitRate(metrics: any): number {
    const total = metrics.predictiveHits + metrics.predictiveMisses;
    return total > 0 ? metrics.predictiveHits / total : 0;
  }

  /**
   * Get latency percentiles
   */
  private getLatencyPercentiles(): {
    p50: number;
    p95: number;
    p99: number;
  } {
    const inferenceMetrics = inferenceEngine.getMetrics();
    const avgLatency = inferenceMetrics.avgLatency || 0;

    // Simplified percentile calculation
    // In production, track actual distribution
    return {
      p50: avgLatency,
      p95: avgLatency * 1.5,
      p99: avgLatency * 2,
    };
  }

  /**
   * Calculate efficiency metrics
   */
  private calculateEfficiency(): {
    cacheImprovement: number;
    coldStartReduction: number;
    preloadEfficiency: number;
    costSavings: number;
  } {
    const baseline = 0.95; // Baseline cache hit rate
    const current = this.calculateAccuracy();

    const improvement = ((current - baseline) / baseline) * 100;
    const coldStartReduction = Math.min(90, improvement * 3);
    const preloadEfficiency = this.calculatePreloadEfficiency();
    const costSavings = this.calculateCostSavings();

    return {
      cacheImprovement: Math.max(0, improvement),
      coldStartReduction,
      preloadEfficiency,
      costSavings,
    };
  }

  /**
   * Calculate preload efficiency
   */
  private calculatePreloadEfficiency(): number {
    const metrics = predictiveCacheManager.getMetrics();
    return metrics.preloadedItems > 0
      ? (metrics.predictiveHits / metrics.preloadedItems) * 100
      : 0;
  }

  /**
   * Calculate cost savings
   */
  private calculateCostSavings(): number {
    // Estimate based on reduced compute and bandwidth
    const metrics = predictiveCacheManager.getMetrics();
    const cacheHits = metrics.predictiveHits;
    const avgRequestCost = 0.0001; // $0.0001 per request
    const savingsPerHit = avgRequestCost * 0.8; // 80% savings
    return cacheHits * savingsPerHit;
  }

  /**
   * Get model performance metrics
   */
  private async getModelPerformance(): Promise<Record<string, any>> {
    // In production, fetch from model registry
    return {
      pagePredictor: {
        accuracy: 0.87,
        loss: 0.23,
        topKAccuracy: 0.94,
      },
      cacheOptimizer: {
        accuracy: 0.91,
        ttlMAE: 120, // seconds
      },
    };
  }

  /**
   * Get last training time
   */
  private getLastTrainingTime(): number {
    // In production, fetch from training logs
    return Date.now() - 24 * 60 * 60 * 1000; // 1 day ago
  }

  /**
   * Get next training time
   */
  private getNextTrainingTime(): number {
    // Based on training schedule
    return Date.now() + 6 * 24 * 60 * 60 * 1000; // In 6 days
  }

  /**
   * Check for alerts
   */
  private checkAlerts(metrics: MLDashboardMetrics): void {
    const alerts: string[] = [];

    // Check accuracy
    if (metrics.predictions.accuracy < this.alertConfig.accuracyThreshold) {
      alerts.push(`Low prediction accuracy: ${(metrics.predictions.accuracy * 100).toFixed(1)}%`);
    }

    // Check latency
    if (metrics.predictions.latency.p95 > this.alertConfig.latencyThresholdMs) {
      alerts.push(`High prediction latency: ${metrics.predictions.latency.p95.toFixed(1)}ms (p95)`);
    }

    // Check cache hit rate
    if (metrics.cache.hitRate < this.alertConfig.hitRateThreshold) {
      alerts.push(`Low cache hit rate: ${(metrics.cache.hitRate * 100).toFixed(1)}%`);
    }

    // Check memory usage
    if (metrics.cache.memoryUsageMB > this.alertConfig.memoryThresholdMB) {
      alerts.push(`High memory usage: ${metrics.cache.memoryUsageMB.toFixed(1)}MB`);
    }

    // Process alerts
    for (const alert of alerts) {
      if (!this.activeAlerts.has(alert)) {
        this.activeAlerts.add(alert);
        this.sendAlert(alert);
      }
    }

    // Clear resolved alerts
    const currentAlerts = new Set(alerts);
    for (const activeAlert of this.activeAlerts) {
      if (!currentAlerts.has(activeAlert)) {
        this.activeAlerts.delete(activeAlert);
        this.resolveAlert(activeAlert);
      }
    }
  }

  /**
   * Send alert
   */
  private sendAlert(message: string): void {
    console.error(`[ML ALERT] ${message}`);
    // In production, send to monitoring service
  }

  /**
   * Resolve alert
   */
  private resolveAlert(message: string): void {
    console.log(`[ML ALERT RESOLVED] ${message}`);
  }

  /**
   * Log metrics summary
   */
  private logMetricsSummary(metrics: MLDashboardMetrics): void {
    console.log('ML Metrics Summary:', {
      accuracy: `${(metrics.predictions.accuracy * 100).toFixed(1)}%`,
      cacheHitRate: `${(metrics.cache.hitRate * 100).toFixed(1)}%`,
      predictiveHitRate: `${(metrics.cache.predictiveHitRate * 100).toFixed(1)}%`,
      latencyP95: `${metrics.predictions.latency.p95.toFixed(1)}ms`,
      efficiency: `${metrics.efficiency.cacheImprovement.toFixed(1)}% improvement`,
      costSavings: `$${metrics.efficiency.costSavings.toFixed(2)}`,
    });
  }

  /**
   * Get current metrics
   */
  getCurrentMetrics(): MLDashboardMetrics | null {
    return this.metricsHistory[this.metricsHistory.length - 1] || null;
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(
    duration?: number // milliseconds
  ): MLDashboardMetrics[] {
    if (!duration) {
      return this.metricsHistory;
    }

    const cutoff = Date.now() - duration;
    return this.metricsHistory.filter(m => m.timestamp >= cutoff);
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary(): {
    current: MLDashboardMetrics | null;
    averages: {
      accuracy: number;
      hitRate: number;
      latency: number;
    };
    trends: {
      accuracyTrend: 'up' | 'down' | 'stable';
      hitRateTrend: 'up' | 'down' | 'stable';
      latencyTrend: 'up' | 'down' | 'stable';
    };
    alerts: string[];
  } {
    const current = this.getCurrentMetrics();
    const history = this.getMetricsHistory(60 * 60 * 1000); // Last hour

    // Calculate averages
    const averages = this.calculateAverages(history);

    // Calculate trends
    const trends = this.calculateTrends(history);

    return {
      current,
      averages,
      trends,
      alerts: Array.from(this.activeAlerts),
    };
  }

  /**
   * Calculate averages from history
   */
  private calculateAverages(history: MLDashboardMetrics[]): {
    accuracy: number;
    hitRate: number;
    latency: number;
  } {
    if (history.length === 0) {
      return { accuracy: 0, hitRate: 0, latency: 0 };
    }

    const sum = history.reduce(
      (acc, m) => ({
        accuracy: acc.accuracy + m.predictions.accuracy,
        hitRate: acc.hitRate + m.cache.hitRate,
        latency: acc.latency + m.predictions.latency.p50,
      }),
      { accuracy: 0, hitRate: 0, latency: 0 }
    );

    return {
      accuracy: sum.accuracy / history.length,
      hitRate: sum.hitRate / history.length,
      latency: sum.latency / history.length,
    };
  }

  /**
   * Calculate trends from history
   */
  private calculateTrends(history: MLDashboardMetrics[]): {
    accuracyTrend: 'up' | 'down' | 'stable';
    hitRateTrend: 'up' | 'down' | 'stable';
    latencyTrend: 'up' | 'down' | 'stable';
  } {
    if (history.length < 2) {
      return {
        accuracyTrend: 'stable',
        hitRateTrend: 'stable',
        latencyTrend: 'stable',
      };
    }

    const recent = history.slice(-10);
    const older = history.slice(-20, -10);

    const recentAvg = this.calculateAverages(recent);
    const olderAvg = this.calculateAverages(older);

    return {
      accuracyTrend: this.getTrend(recentAvg.accuracy, olderAvg.accuracy),
      hitRateTrend: this.getTrend(recentAvg.hitRate, olderAvg.hitRate),
      latencyTrend: this.getTrend(olderAvg.latency, recentAvg.latency), // Reversed for latency
    };
  }

  /**
   * Get trend direction
   */
  private getTrend(recent: number, older: number): 'up' | 'down' | 'stable' {
    const threshold = 0.05; // 5% change threshold
    const change = (recent - older) / older;

    if (Math.abs(change) < threshold) {
      return 'stable';
    }
    return change > 0 ? 'up' : 'down';
  }

  /**
   * Export metrics for external monitoring
   */
  exportMetrics(format: 'prometheus' | 'json' = 'json'): string {
    const current = this.getCurrentMetrics();

    if (!current) {
      return format === 'json' ? '{}' : '';
    }

    if (format === 'json') {
      return JSON.stringify(current, null, 2);
    }

    // Prometheus format
    const lines: string[] = [];

    lines.push('# HELP ml_prediction_accuracy ML model prediction accuracy');
    lines.push('# TYPE ml_prediction_accuracy gauge');
    lines.push(`ml_prediction_accuracy ${current.predictions.accuracy}`);

    lines.push('# HELP ml_cache_hit_rate ML-powered cache hit rate');
    lines.push('# TYPE ml_cache_hit_rate gauge');
    lines.push(`ml_cache_hit_rate ${current.cache.hitRate}`);

    lines.push('# HELP ml_predictive_hit_rate Predictive cache hit rate');
    lines.push('# TYPE ml_predictive_hit_rate gauge');
    lines.push(`ml_predictive_hit_rate ${current.cache.predictiveHitRate}`);

    lines.push('# HELP ml_prediction_latency_ms ML prediction latency in milliseconds');
    lines.push('# TYPE ml_prediction_latency_ms gauge');
    lines.push(`ml_prediction_latency_ms{quantile="0.5"} ${current.predictions.latency.p50}`);
    lines.push(`ml_prediction_latency_ms{quantile="0.95"} ${current.predictions.latency.p95}`);
    lines.push(`ml_prediction_latency_ms{quantile="0.99"} ${current.predictions.latency.p99}`);

    lines.push('# HELP ml_cache_memory_usage_mb ML cache memory usage in MB');
    lines.push('# TYPE ml_cache_memory_usage_mb gauge');
    lines.push(`ml_cache_memory_usage_mb ${current.cache.memoryUsageMB}`);

    lines.push('# HELP ml_efficiency_improvement ML cache efficiency improvement percentage');
    lines.push('# TYPE ml_efficiency_improvement gauge');
    lines.push(`ml_efficiency_improvement ${current.efficiency.cacheImprovement}`);

    return lines.join('\n');
  }

  /**
   * Stop metrics collection
   */
  stop(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }
}

export const mlMetricsDashboard = new MLMetricsDashboard();