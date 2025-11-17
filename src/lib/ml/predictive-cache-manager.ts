/**
 * Predictive Cache Manager
 * Integrates ML predictions with multi-layer cache for intelligent pre-loading
 */

import { MultiLayerCache } from '../cache/multi-layer-cache';
import { InferenceEngine } from './inference/inference-engine';
import { FeatureExtractor } from './features/feature-extractor';
import * as redis from '../cache/redis';

export interface PredictiveCacheConfig {
  enabled: boolean;
  warmingThreshold: number;
  maxPreloadItems: number;
  preloadBudgetMB: number;
  adaptiveTTL: boolean;
  edgeInferenceUrl?: string;
}

export interface CacheWarmingTask {
  resources: string[];
  priority: number;
  deadline: number;
  estimatedSize: number;
}

export interface PredictiveCacheMetrics {
  predictiveHits: number;
  predictiveMisses: number;
  preloadedItems: number;
  warmingTasks: number;
  predictionAccuracy: number;
  cacheEfficiency: number;
  memoryUsed: number;
  edgeLatency: number;
}

export class PredictiveCacheManager {
  private cache: MultiLayerCache;
  private inferenceEngine: InferenceEngine;
  private featureExtractor: FeatureExtractor;
  private config: PredictiveCacheConfig;

  private warmingQueue: CacheWarmingTask[] = [];
  private preloadedResources = new Set<string>();
  private sessionPredictions = new Map<string, any>();

  private metrics: PredictiveCacheMetrics = {
    predictiveHits: 0,
    predictiveMisses: 0,
    preloadedItems: 0,
    warmingTasks: 0,
    predictionAccuracy: 0,
    cacheEfficiency: 0,
    memoryUsed: 0,
    edgeLatency: 0,
  };

  constructor(config?: Partial<PredictiveCacheConfig>) {
    this.config = {
      enabled: true,
      warmingThreshold: 0.7,
      maxPreloadItems: 50,
      preloadBudgetMB: 100,
      adaptiveTTL: true,
      ...config,
    };

    this.cache = new MultiLayerCache();
    this.inferenceEngine = new InferenceEngine();
    this.featureExtractor = new FeatureExtractor();

    // Start background processes
    if (this.config.enabled) {
      this.startWarmingWorker();
      this.startPredictionUpdater();
    }
  }

  /**
   * Get cached value with predictive pre-loading
   */
  async get<T>(
    key: string,
    sessionId: string,
    context?: any,
    loader?: () => Promise<T>
  ): Promise<T | null> {
    // Check if resource was pre-loaded
    const wasPreloaded = this.preloadedResources.has(key);

    // Get from cache
    const value = await this.cache.get(key, { loader });

    // Update metrics
    if (value !== null) {
      if (wasPreloaded) {
        this.metrics.predictiveHits++;
      }
    } else {
      if (wasPreloaded) {
        this.metrics.predictiveMisses++;
      }
    }

    // Trigger predictive pre-loading for next likely requests
    this.predictAndPreload(sessionId, key, context);

    return value;
  }

  /**
   * Predict and pre-load next likely resources
   */
  private async predictAndPreload(
    sessionId: string,
    currentResource: string,
    context: any
  ): Promise<void> {
    if (!this.config.enabled) return;

    try {
      // Extract features for prediction
      const features = this.featureExtractor.extractTransitionFeatures(
        currentResource,
        context
      );

      // Get predictions
      const response = await this.inferenceEngine.predict({
        type: 'page',
        features,
        context,
        options: { topK: 5 },
      });

      // Store predictions for session
      this.sessionPredictions.set(sessionId, response.predictions);

      // Schedule pre-loading for high-confidence predictions
      const toPreload = response.predictions.filter(
        p => p.probability > this.config.warmingThreshold
      );

      if (toPreload.length > 0) {
        await this.schedulePreloading(toPreload, sessionId);
      }
    } catch (error) {
      console.error('Predictive pre-loading error:', error);
    }
  }

  /**
   * Schedule resources for pre-loading
   */
  private async schedulePreloading(
    predictions: any[],
    sessionId: string
  ): Promise<void> {
    // Create warming task
    const task: CacheWarmingTask = {
      resources: predictions.map(p => p.page),
      priority: Math.max(...predictions.map(p => p.probability)),
      deadline: Date.now() + 5000, // 5 seconds
      estimatedSize: this.estimateResourceSize(predictions),
    };

    // Check budget
    if (this.checkBudget(task.estimatedSize)) {
      this.warmingQueue.push(task);
      this.warmingQueue.sort((a, b) => b.priority - a.priority);
      this.metrics.warmingTasks++;
    }
  }

  /**
   * Background worker for cache warming
   */
  private startWarmingWorker(): void {
    setInterval(async () => {
      await this.processWarmingQueue();
    }, 1000); // Process every second
  }

  /**
   * Process warming queue
   */
  private async processWarmingQueue(): Promise<void> {
    const now = Date.now();
    const batch: string[] = [];

    // Process high-priority and deadline-approaching tasks
    while (this.warmingQueue.length > 0) {
      const task = this.warmingQueue[0];

      // Check deadline
      if (task.deadline < now) {
        this.warmingQueue.shift();
        continue;
      }

      // Check budget
      if (!this.checkBudget(task.estimatedSize)) {
        break;
      }

      // Add to batch
      batch.push(...task.resources.slice(0, this.config.maxPreloadItems));
      this.warmingQueue.shift();

      // Limit batch size
      if (batch.length >= 10) {
        break;
      }
    }

    // Pre-load resources
    if (batch.length > 0) {
      await this.preloadResources(batch);
    }
  }

  /**
   * Pre-load resources into cache
   */
  private async preloadResources(resources: string[]): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const resource of resources) {
      // Skip if already cached
      const exists = await this.cache.has(resource);
      if (exists) continue;

      promises.push(
        this.preloadResource(resource)
          .then(() => {
            this.preloadedResources.add(resource);
            this.metrics.preloadedItems++;
          })
          .catch(error => {
            console.error(`Failed to pre-load ${resource}:`, error);
          })
      );
    }

    await Promise.allSettled(promises);
  }

  /**
   * Pre-load individual resource
   */
  private async preloadResource(resource: string): Promise<void> {
    // Simulate fetching the resource
    // In production, this would call the actual API or fetch the data
    const data = await this.fetchResource(resource);

    if (data) {
      // Get optimal TTL from ML model
      const ttl = await this.getOptimalTTL(resource);

      // Store in cache
      await this.cache.set(resource, data, { ttl });
    }
  }

  /**
   * Fetch resource data
   */
  private async fetchResource(resource: string): Promise<any> {
    // In production, implement actual resource fetching
    // This is a placeholder that generates mock data
    return {
      resource,
      data: `Preloaded data for ${resource}`,
      timestamp: Date.now(),
    };
  }

  /**
   * Get optimal TTL using ML model
   */
  private async getOptimalTTL(resource: string): Promise<number> {
    if (!this.config.adaptiveTTL) {
      return 3600; // Default 1 hour
    }

    try {
      // Extract features for cache optimization
      const features = this.featureExtractor.extractCacheFeatures(
        resource,
        {
          frequency: 10,
          recency: 3600000,
          regularityScore: 0.8,
          peakAccessTime: new Date().getHours(),
        }
      );

      // Get cache optimization prediction
      const response = await this.inferenceEngine.predict({
        type: 'cache',
        features,
        context: { resource },
      });

      const optimization = response.predictions[0];
      return optimization.optimalTTL || 3600;
    } catch (error) {
      console.error('Error predicting optimal TTL:', error);
      return 3600; // Fallback
    }
  }

  /**
   * Background updater for session predictions
   */
  private startPredictionUpdater(): void {
    setInterval(async () => {
      await this.updateSessionPredictions();
    }, 5000); // Update every 5 seconds
  }

  /**
   * Update predictions for active sessions
   */
  private async updateSessionPredictions(): Promise<void> {
    const activeSessions = await this.getActiveSessions();

    for (const session of activeSessions) {
      try {
        // Get latest session context
        const context = await this.getSessionContext(session.id);

        // Update predictions
        const features = this.featureExtractor.extractUserFeatures(
          context.current,
          context.historical
        );

        const response = await this.inferenceEngine.predict({
          type: 'page',
          features,
          context: context.current,
          options: { topK: 10 },
        });

        // Store updated predictions
        this.sessionPredictions.set(session.id, response.predictions);

        // Schedule high-confidence pre-loads
        const toPreload = response.predictions
          .filter(p => p.probability > 0.8)
          .slice(0, 3);

        if (toPreload.length > 0) {
          await this.schedulePreloading(toPreload, session.id);
        }
      } catch (error) {
        console.error(`Error updating predictions for session ${session.id}:`, error);
      }
    }
  }

  /**
   * Get active sessions from Redis
   */
  private async getActiveSessions(): Promise<any[]> {
    try {
      // In production, fetch from session store
      const sessions = await redis.getCache('active_sessions');
      return sessions || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Get session context
   */
  private async getSessionContext(sessionId: string): Promise<any> {
    try {
      const context = await redis.getCache(`session:${sessionId}`);
      return context || {
        current: {},
        historical: {},
      };
    } catch (error) {
      return { current: {}, historical: {} };
    }
  }

  /**
   * Check if resource size fits in budget
   */
  private checkBudget(sizeBytes: number): boolean {
    const sizeMB = sizeBytes / (1024 * 1024);
    return this.metrics.memoryUsed + sizeMB <= this.config.preloadBudgetMB;
  }

  /**
   * Estimate resource size
   */
  private estimateResourceSize(predictions: any[]): number {
    // Rough estimation based on resource type
    let totalSize = 0;

    for (const prediction of predictions) {
      if (prediction.page?.includes('property')) {
        totalSize += 50 * 1024; // 50KB for property data
      } else if (prediction.page?.includes('council')) {
        totalSize += 30 * 1024; // 30KB for council data
      } else if (prediction.page?.includes('search')) {
        totalSize += 100 * 1024; // 100KB for search results
      } else {
        totalSize += 20 * 1024; // 20KB default
      }
    }

    return totalSize;
  }

  /**
   * Invalidate cache based on predictions
   */
  async predictiveInvalidation(pattern: string): Promise<number> {
    try {
      // Get all matching resources
      const resources = await this.getResourcesByPattern(pattern);

      let invalidated = 0;

      for (const resource of resources) {
        // Predict invalidation probability
        const features = this.featureExtractor.extractCacheFeatures(
          resource,
          { frequency: 1, recency: 0, regularityScore: 0.5 }
        );

        const response = await this.inferenceEngine.predict({
          type: 'cache',
          features,
          context: { resource },
        });

        const optimization = response.predictions[0];

        // Invalidate if probability is high
        if (optimization.invalidationProbability > 0.6) {
          await this.cache.delete(resource);
          this.preloadedResources.delete(resource);
          invalidated++;
        }
      }

      return invalidated;
    } catch (error) {
      console.error('Predictive invalidation error:', error);
      return 0;
    }
  }

  /**
   * Get resources matching pattern
   */
  private async getResourcesByPattern(pattern: string): Promise<string[]> {
    // In production, query from cache index
    return Array.from(this.preloadedResources).filter(r =>
      r.includes(pattern)
    );
  }

  /**
   * Use edge inference for ultra-low latency
   */
  async edgePredict(
    sessionId: string,
    context: any
  ): Promise<any> {
    if (!this.config.edgeInferenceUrl) {
      // Fall back to local inference
      return this.inferenceEngine.predict({
        type: 'page',
        context,
        options: { topK: 3 },
      });
    }

    const startTime = performance.now();

    try {
      const response = await fetch(this.config.edgeInferenceUrl + '/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'page',
          sessionId,
          context,
        }),
      });

      const result = await response.json();

      this.metrics.edgeLatency = performance.now() - startTime;

      return result;
    } catch (error) {
      console.error('Edge inference error:', error);
      // Fall back to local
      return this.inferenceEngine.predict({
        type: 'page',
        context,
        options: { topK: 3 },
      });
    }
  }

  /**
   * Analyze cache performance with ML insights
   */
  async analyzeCachePerformance(): Promise<{
    metrics: PredictiveCacheMetrics;
    insights: any;
    recommendations: string[];
  }> {
    const cacheMetrics = this.cache.getMetrics();

    // Get ML insights
    const insights = await this.inferenceEngine.getInsights({
      cacheHitRate: cacheMetrics.overall.overallHitRate,
      predictiveHitRate: this.calculatePredictiveHitRate(),
      preloadEfficiency: this.calculatePreloadEfficiency(),
    });

    // Generate recommendations
    const recommendations: string[] = [];

    if (this.metrics.predictionAccuracy < 0.7) {
      recommendations.push('Consider retraining ML models with recent data');
    }

    if (this.metrics.predictiveHits / this.metrics.preloadedItems < 0.5) {
      recommendations.push('Increase prediction confidence threshold');
    }

    if (this.metrics.memoryUsed > this.config.preloadBudgetMB * 0.9) {
      recommendations.push('Increase preload budget or optimize resource selection');
    }

    if (this.metrics.edgeLatency > 10) {
      recommendations.push('Consider deploying models closer to edge locations');
    }

    return {
      metrics: this.metrics,
      insights,
      recommendations,
    };
  }

  /**
   * Calculate predictive hit rate
   */
  private calculatePredictiveHitRate(): number {
    const total = this.metrics.predictiveHits + this.metrics.predictiveMisses;
    return total > 0 ? this.metrics.predictiveHits / total : 0;
  }

  /**
   * Calculate preload efficiency
   */
  private calculatePreloadEfficiency(): number {
    return this.metrics.preloadedItems > 0
      ? this.metrics.predictiveHits / this.metrics.preloadedItems
      : 0;
  }

  /**
   * Get comprehensive metrics
   */
  getMetrics(): PredictiveCacheMetrics & {
    cacheMetrics: any;
    inferenceMetrics: any;
  } {
    return {
      ...this.metrics,
      cacheMetrics: this.cache.getMetrics(),
      inferenceMetrics: this.inferenceEngine.getMetrics(),
    };
  }

  /**
   * Enable/disable predictive caching
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;

    if (!enabled) {
      // Clear warming queue and predictions
      this.warmingQueue = [];
      this.sessionPredictions.clear();
      this.preloadedResources.clear();
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PredictiveCacheConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      predictiveHits: 0,
      predictiveMisses: 0,
      preloadedItems: 0,
      warmingTasks: 0,
      predictionAccuracy: 0,
      cacheEfficiency: 0,
      memoryUsed: 0,
      edgeLatency: 0,
    };
  }
}

export const predictiveCacheManager = new PredictiveCacheManager();