/**
 * Real-time ML Inference Engine
 * Handles model loading, prediction serving, and optimization
 */

import * as tf from '@tensorflow/tfjs';
import { PagePredictorModel } from '../models/page-predictor-model';
import { CacheOptimizerModel } from '../models/cache-optimizer-model';
import { FeatureExtractor } from '../features/feature-extractor';
import { LRUCache } from '../../cache/lru-cache';

export interface PredictionRequest {
  type: 'page' | 'cache';
  features?: any;
  context?: any;
  options?: {
    topK?: number;
    threshold?: number;
    includeFeatures?: boolean;
  };
}

export interface PredictionResponse {
  predictions: any[];
  confidence: number;
  latency: number;
  cached: boolean;
  modelVersion: string;
}

export class InferenceEngine {
  private pagePredictorModel: PagePredictorModel;
  private cacheOptimizerModel: CacheOptimizerModel;
  private featureExtractor: FeatureExtractor;
  private predictionCache: LRUCache;
  private modelVersions: Map<string, string>;
  private isReady: boolean = false;
  private warmupComplete: boolean = false;

  // Performance metrics
  private metrics = {
    totalPredictions: 0,
    cacheHits: 0,
    avgLatency: 0,
    modelLoadTime: 0,
  };

  constructor() {
    this.pagePredictorModel = new PagePredictorModel();
    this.cacheOptimizerModel = new CacheOptimizerModel();
    this.featureExtractor = new FeatureExtractor();
    this.predictionCache = new LRUCache({ maxSize: 1000 });
    this.modelVersions = new Map();

    // Initialize on construction
    this.initialize();
  }

  /**
   * Initialize inference engine
   */
  async initialize(): Promise<void> {
    const startTime = Date.now();

    try {
      // Set backend based on environment
      const backend = typeof window !== 'undefined' ? 'webgl' : 'tensorflow';
      await tf.setBackend(backend);

      // Load models
      await Promise.all([
        this.loadPagePredictorModel(),
        this.loadCacheOptimizerModel(),
      ]);

      // Warm up models
      await this.warmupModels();

      this.isReady = true;
      this.metrics.modelLoadTime = Date.now() - startTime;

      console.log(`Inference engine initialized in ${this.metrics.modelLoadTime}ms`);
    } catch (error) {
      console.error('Failed to initialize inference engine:', error);
      // Fall back to default models
      this.initializeDefaultModels();
    }
  }

  /**
   * Load page predictor model
   */
  private async loadPagePredictorModel(): Promise<void> {
    try {
      // Try loading from production path
      await this.pagePredictorModel.loadModel('/models/production/page-predictor');
      this.modelVersions.set('page-predictor', 'production');
    } catch (error) {
      console.warn('Using default page predictor model');
      this.pagePredictorModel['model'] = this.pagePredictorModel.buildLiteModel();
      this.modelVersions.set('page-predictor', 'default');
    }
  }

  /**
   * Load cache optimizer model
   */
  private async loadCacheOptimizerModel(): Promise<void> {
    try {
      // Try loading from production path
      await this.cacheOptimizerModel.loadModel('/models/production/cache-optimizer');
      this.modelVersions.set('cache-optimizer', 'production');
    } catch (error) {
      console.warn('Using default cache optimizer model');
      this.cacheOptimizerModel['model'] = this.cacheOptimizerModel.buildCacheModel();
      this.modelVersions.set('cache-optimizer', 'default');
    }
  }

  /**
   * Initialize default models for fallback
   */
  private initializeDefaultModels(): void {
    this.pagePredictorModel['model'] = this.pagePredictorModel.buildLiteModel();
    this.cacheOptimizerModel['model'] = this.cacheOptimizerModel.buildCacheModel();
    this.modelVersions.set('page-predictor', 'fallback');
    this.modelVersions.set('cache-optimizer', 'fallback');
    this.isReady = true;
  }

  /**
   * Warm up models with dummy predictions
   */
  private async warmupModels(): Promise<void> {
    console.log('Warming up models...');

    // Warm up page predictor
    const dummyPageFeatures = new Float32Array(100).fill(0.5);
    await this.pagePredictorModel.predict(dummyPageFeatures, 1);

    // Warm up cache optimizer
    const dummyCacheFeatures = new Float32Array(50).fill(0.5);
    await this.cacheOptimizerModel.predict(dummyCacheFeatures);

    this.warmupComplete = true;
    console.log('Model warmup complete');
  }

  /**
   * Main prediction interface
   */
  async predict(request: PredictionRequest): Promise<PredictionResponse> {
    if (!this.isReady) {
      await this.waitForReady();
    }

    const startTime = performance.now();
    const cacheKey = this.generateCacheKey(request);

    // Check prediction cache
    const cached = this.predictionCache.get(cacheKey);
    if (cached) {
      this.metrics.cacheHits++;
      return {
        ...cached,
        cached: true,
        latency: performance.now() - startTime,
      };
    }

    // Generate predictions based on type
    let predictions: any[];
    let confidence: number = 0;

    switch (request.type) {
      case 'page':
        const pageResults = await this.predictNextPages(request);
        predictions = pageResults.predictions;
        confidence = pageResults.confidence;
        break;

      case 'cache':
        const cacheResults = await this.predictCacheOptimization(request);
        predictions = [cacheResults.optimization];
        confidence = cacheResults.confidence;
        break;

      default:
        throw new Error(`Unknown prediction type: ${request.type}`);
    }

    const response: PredictionResponse = {
      predictions,
      confidence,
      latency: performance.now() - startTime,
      cached: false,
      modelVersion: this.modelVersions.get(`${request.type}-predictor`) || 'unknown',
    };

    // Cache the response
    this.predictionCache.set(cacheKey, response, { ttl: 60000 }); // 1 minute TTL

    // Update metrics
    this.updateMetrics(response.latency);

    return response;
  }

  /**
   * Predict next pages
   */
  private async predictNextPages(request: PredictionRequest): Promise<{
    predictions: any[];
    confidence: number;
  }> {
    // Extract features
    const features = request.features ||
      this.featureExtractor.extractUserFeatures(
        request.context?.session,
        request.context?.historical
      );

    // Get predictions
    const topK = request.options?.topK || 5;
    const predictions = await this.pagePredictorModel.predict(features, topK);

    // Calculate overall confidence
    const confidence = predictions.length > 0
      ? predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length
      : 0;

    return { predictions, confidence };
  }

  /**
   * Predict cache optimization
   */
  private async predictCacheOptimization(request: PredictionRequest): Promise<{
    optimization: any;
    confidence: number;
  }> {
    // Extract features
    const features = request.features ||
      this.featureExtractor.extractCacheFeatures(
        request.context?.resource,
        request.context?.patterns
      );

    // Get optimization
    const optimization = await this.cacheOptimizerModel.predict(features);

    // Add resource context
    optimization.resource = request.context?.resource || '';

    // Calculate confidence based on multiple factors
    const confidence = this.calculateCacheConfidence(optimization);

    return { optimization, confidence };
  }

  /**
   * Batch prediction for efficiency
   */
  async batchPredict(requests: PredictionRequest[]): Promise<PredictionResponse[]> {
    if (!this.isReady) {
      await this.waitForReady();
    }

    // Group by prediction type
    const pageRequests = requests.filter(r => r.type === 'page');
    const cacheRequests = requests.filter(r => r.type === 'cache');

    const responses: PredictionResponse[] = [];

    // Process page predictions in batch
    if (pageRequests.length > 0) {
      const pageFeatures = pageRequests.map(r =>
        r.features || this.featureExtractor.extractUserFeatures(
          r.context?.session,
          r.context?.historical
        )
      );

      const pagePredictions = await this.pagePredictorModel.batchPredict(
        pageFeatures,
        pageRequests[0].options?.topK || 5
      );

      for (let i = 0; i < pageRequests.length; i++) {
        responses.push({
          predictions: pagePredictions[i],
          confidence: this.calculateConfidence(pagePredictions[i]),
          latency: 0, // Will be calculated
          cached: false,
          modelVersion: this.modelVersions.get('page-predictor') || 'unknown',
        });
      }
    }

    // Process cache predictions in batch
    if (cacheRequests.length > 0) {
      const cacheFeatures = cacheRequests.map(r =>
        r.features || this.featureExtractor.extractCacheFeatures(
          r.context?.resource,
          r.context?.patterns
        )
      );

      const resources = cacheRequests.map(r => r.context?.resource || '');
      const cacheOptimizations = await this.cacheOptimizerModel.batchPredict(
        cacheFeatures,
        resources
      );

      for (let i = 0; i < cacheRequests.length; i++) {
        responses.push({
          predictions: [cacheOptimizations[i]],
          confidence: this.calculateCacheConfidence(cacheOptimizations[i]),
          latency: 0,
          cached: false,
          modelVersion: this.modelVersions.get('cache-optimizer') || 'unknown',
        });
      }
    }

    return responses;
  }

  /**
   * Stream predictions for real-time applications
   */
  async *streamPredictions(
    sessionId: string,
    sessionData: any
  ): AsyncGenerator<PredictionResponse> {
    while (true) {
      // Extract current features
      const features = this.featureExtractor.extractUserFeatures(
        sessionData,
        sessionData.historical
      );

      // Get predictions
      const predictions = await this.pagePredictorModel.predict(features, 3);

      yield {
        predictions,
        confidence: this.calculateConfidence(predictions),
        latency: 0,
        cached: false,
        modelVersion: this.modelVersions.get('page-predictor') || 'unknown',
      };

      // Wait before next prediction
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update session data (in production, fetch updates)
      sessionData.pageViews++;
      sessionData.duration += 1000;
    }
  }

  /**
   * Get inference insights
   */
  async getInsights(sessionContext: any): Promise<{
    userSegment: string;
    behaviorPatterns: string[];
    recommendations: string[];
    cacheStrategy: any;
  }> {
    // Extract comprehensive features
    const userFeatures = this.featureExtractor.extractUserFeatures(
      sessionContext,
      sessionContext.historical
    );

    // Predict next actions
    const nextPages = await this.pagePredictorModel.predict(userFeatures, 10);

    // Analyze patterns
    const patterns = this.analyzePatterns(nextPages, sessionContext);

    // Generate recommendations
    const recommendations = this.generateRecommendations(patterns, sessionContext);

    // Determine optimal cache strategy
    const cacheStrategy = await this.determineCacheStrategy(sessionContext);

    return {
      userSegment: this.classifyUserSegment(sessionContext),
      behaviorPatterns: patterns,
      recommendations,
      cacheStrategy,
    };
  }

  // Helper methods

  private generateCacheKey(request: PredictionRequest): string {
    const key = `${request.type}:${JSON.stringify(request.context || {})}:${request.options?.topK || 5}`;
    return key;
  }

  private calculateConfidence(predictions: any[]): number {
    if (!predictions || predictions.length === 0) return 0;

    const totalConfidence = predictions.reduce((sum, p) => sum + (p.confidence || p.probability || 0), 0);
    return totalConfidence / predictions.length;
  }

  private calculateCacheConfidence(optimization: any): number {
    // Weighted confidence based on multiple signals
    const shouldCacheConf = optimization.shouldCache ? 0.3 : 0;
    const priorityConf = optimization.priority * 0.3;
    const warmingConf = optimization.warmingScore * 0.2;
    const ttlConf = Math.min(optimization.optimalTTL / 86400, 1) * 0.2;

    return shouldCacheConf + priorityConf + warmingConf + ttlConf;
  }

  private async waitForReady(): Promise<void> {
    const maxWait = 10000; // 10 seconds
    const startTime = Date.now();

    while (!this.isReady && (Date.now() - startTime) < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!this.isReady) {
      throw new Error('Inference engine not ready after timeout');
    }
  }

  private updateMetrics(latency: number): void {
    this.metrics.totalPredictions++;
    this.metrics.avgLatency = (
      (this.metrics.avgLatency * (this.metrics.totalPredictions - 1) + latency) /
      this.metrics.totalPredictions
    );
  }

  private analyzePatterns(predictions: any[], context: any): string[] {
    const patterns: string[] = [];

    // Analyze prediction patterns
    const propertyViews = predictions.filter(p => p.page?.includes('property')).length;
    const councilViews = predictions.filter(p => p.page?.includes('council')).length;
    const searchViews = predictions.filter(p => p.page?.includes('search')).length;

    if (propertyViews > 3) patterns.push('property_focused');
    if (councilViews > 2) patterns.push('council_explorer');
    if (searchViews > 2) patterns.push('active_searcher');

    // Analyze session patterns
    if (context.sessionDuration > 600000) patterns.push('long_session');
    if (context.pageViews > 20) patterns.push('high_engagement');
    if (context.bounceRate < 0.2) patterns.push('low_bounce');

    return patterns;
  }

  private generateRecommendations(patterns: string[], context: any): string[] {
    const recommendations: string[] = [];

    if (patterns.includes('property_focused')) {
      recommendations.push('Show similar properties');
      recommendations.push('Enable comparison tool');
    }

    if (patterns.includes('active_searcher')) {
      recommendations.push('Suggest saved searches');
      recommendations.push('Show recent searches');
    }

    if (patterns.includes('high_engagement')) {
      recommendations.push('Offer detailed analytics');
      recommendations.push('Enable advanced filters');
    }

    return recommendations;
  }

  private async determineCacheStrategy(context: any): Promise<any> {
    const features = this.featureExtractor.extractCacheFeatures(
      context.currentPath,
      {
        frequency: context.pageViews,
        recency: 0,
        regularityScore: 0.7,
        peakAccessTime: new Date().getHours(),
      }
    );

    const optimization = await this.cacheOptimizerModel.predict(features);

    return {
      strategy: optimization.shouldCache ? 'aggressive' : 'conservative',
      ttl: optimization.optimalTTL,
      priority: optimization.priority,
      warmingEnabled: optimization.warmingScore > 0.7,
    };
  }

  private classifyUserSegment(context: any): string {
    // Simple rule-based classification
    if (context.favoriteListings?.length > 5) return 'buyer';
    if (context.viewedListings?.length > 20) return 'researcher';
    if (context.searchCount > 10) return 'active_searcher';
    if (context.councilViews > 5) return 'council_focused';
    return 'explorer';
  }

  /**
   * Get performance metrics
   */
  getMetrics(): any {
    return {
      ...this.metrics,
      cacheHitRate: this.metrics.cacheHits / Math.max(this.metrics.totalPredictions, 1),
      ready: this.isReady,
      warmupComplete: this.warmupComplete,
      modelVersions: Array.from(this.modelVersions.entries()),
    };
  }

  /**
   * Update model without downtime
   */
  async hotReloadModel(
    modelType: 'page-predictor' | 'cache-optimizer',
    modelPath: string
  ): Promise<void> {
    console.log(`Hot reloading ${modelType} from ${modelPath}`);

    try {
      if (modelType === 'page-predictor') {
        const newModel = new PagePredictorModel();
        await newModel.loadModel(modelPath);

        // Atomic swap
        this.pagePredictorModel = newModel;
        this.modelVersions.set('page-predictor', `hotreload-${Date.now()}`);
      } else {
        const newModel = new CacheOptimizerModel();
        await newModel.loadModel(modelPath);

        // Atomic swap
        this.cacheOptimizerModel = newModel;
        this.modelVersions.set('cache-optimizer', `hotreload-${Date.now()}`);
      }

      // Clear prediction cache after model update
      this.predictionCache.clear();

      console.log(`Model ${modelType} hot reloaded successfully`);
    } catch (error) {
      console.error(`Failed to hot reload ${modelType}:`, error);
      throw error;
    }
  }
}

export const inferenceEngine = new InferenceEngine();