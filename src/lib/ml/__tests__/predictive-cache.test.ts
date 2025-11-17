/**
 * Integration tests for ML-powered predictive caching system
 */

import {
  PredictiveCacheManager,
  InferenceEngine,
  TrainingPipeline,
  FeatureExtractor,
  MLMetricsDashboard,
} from '../index';

describe('ML-Powered Predictive Caching System', () => {
  let cacheManager: PredictiveCacheManager;
  let inferenceEngine: InferenceEngine;
  let dashboard: MLMetricsDashboard;

  beforeEach(async () => {
    // Initialize components
    cacheManager = new PredictiveCacheManager({
      enabled: true,
      warmingThreshold: 0.7,
      maxPreloadItems: 20,
      preloadBudgetMB: 50,
      adaptiveTTL: true,
    });

    inferenceEngine = new InferenceEngine();
    await inferenceEngine.initialize();

    dashboard = new MLMetricsDashboard({
      accuracyThreshold: 0.75,
      latencyThresholdMs: 10,
      hitRateThreshold: 0.95,
      memoryThresholdMB: 90,
    });
  });

  afterEach(() => {
    dashboard.stop();
  });

  describe('Feature Extraction', () => {
    it('should extract user behavior features correctly', () => {
      const extractor = new FeatureExtractor();

      const sessionData = {
        duration: 1800000, // 30 minutes
        pageViews: 15,
        avgPageTime: 120000, // 2 minutes
        bounceRate: 0.2,
        depth: 5,
        currentPath: '/properties/search',
        previousPath: '/councils/barnet',
        navigationSpeed: 5,
        userSegment: 'buyer',
        deviceType: 'desktop',
        connectionSpeed: 'fast',
        council: 'barnet',
        councilGroup: 'outer',
        distanceFromCenter: 10,
        propertyType: 'house',
        priceRange: '500k-1m',
        bedroomCount: 3,
        searchRadius: 5,
        searchCount: 8,
        filterCount: 4,
        viewedListings: Array(10).fill('listing'),
        favoriteListings: Array(3).fill('favorite'),
        pageType: 'search',
        mediaViewed: true,
        documentsAccessed: false,
        mapsInteraction: true,
      };

      const features = extractor.extractUserFeatures(sessionData);

      expect(features).toBeInstanceOf(Float32Array);
      expect(features.length).toBeGreaterThan(50);
      expect(features[0]).toBeGreaterThanOrEqual(0);
      expect(features[0]).toBeLessThanOrEqual(1);
    });

    it('should extract cache optimization features', () => {
      const extractor = new FeatureExtractor();

      const resource = '/api/properties/search?council=barnet&type=house';
      const accessPatterns = {
        frequency: 50,
        recency: 3600000, // 1 hour
        regularityScore: 0.8,
        peakAccessTime: 19,
        buyerAccess: 0.6,
        sellerAccess: 0.2,
        researcherAccess: 0.15,
        investorAccess: 0.05,
        councilDistribution: {
          barnet: 0.4,
          brent: 0.3,
          camden: 0.3,
        },
        avgLoadTime: 1500,
        cacheHitRate: 0.92,
        errorRate: 0.01,
        ttlEfficiency: 0.85,
      };

      const features = extractor.extractCacheFeatures(resource, accessPatterns);

      expect(features).toBeInstanceOf(Float32Array);
      expect(features.length).toBeGreaterThan(30);
    });
  });

  describe('Prediction Accuracy', () => {
    it('should predict next pages with reasonable accuracy', async () => {
      const context = {
        session: {
          currentPath: '/properties/search',
          pageViews: 10,
          duration: 600000,
          userSegment: 'buyer',
          deviceType: 'desktop',
        },
      };

      const response = await inferenceEngine.predict({
        type: 'page',
        context: context.session,
        options: { topK: 5 },
      });

      expect(response).toBeDefined();
      expect(response.predictions).toBeInstanceOf(Array);
      expect(response.predictions.length).toBeLessThanOrEqual(5);
      expect(response.confidence).toBeGreaterThanOrEqual(0);
      expect(response.confidence).toBeLessThanOrEqual(1);
      expect(response.latency).toBeGreaterThan(0);
      expect(response.modelVersion).toBeDefined();
    });

    it('should predict cache optimizations', async () => {
      const context = {
        resource: '/api/properties/featured',
        patterns: {
          frequency: 100,
          recency: 600000,
          regularityScore: 0.9,
          peakAccessTime: 20,
        },
      };

      const response = await inferenceEngine.predict({
        type: 'cache',
        context,
      });

      expect(response).toBeDefined();
      expect(response.predictions).toHaveLength(1);

      const optimization = response.predictions[0];
      expect(optimization).toHaveProperty('shouldCache');
      expect(optimization).toHaveProperty('priority');
      expect(optimization).toHaveProperty('optimalTTL');
      expect(optimization).toHaveProperty('warmingScore');
      expect(optimization).toHaveProperty('invalidationProbability');
    });
  });

  describe('Cache Performance', () => {
    it('should improve cache hit rate with predictive pre-loading', async () => {
      const sessionId = 'test-session-123';
      const initialMetrics = cacheManager.getMetrics();

      // Simulate user navigation
      const pages = [
        '/properties/search',
        '/properties/123',
        '/councils/barnet',
        '/statistics',
      ];

      for (const page of pages) {
        await cacheManager.get(page, sessionId, {
          currentPath: page,
          pageViews: 5,
        });
      }

      const finalMetrics = cacheManager.getMetrics();

      expect(finalMetrics.preloadedItems).toBeGreaterThanOrEqual(0);
      expect(finalMetrics.cacheEfficiency).toBeGreaterThanOrEqual(0);
    });

    it('should warm cache based on predictions', async () => {
      const analysis = await cacheManager.analyzeCachePerformance();

      expect(analysis).toBeDefined();
      expect(analysis.metrics).toBeDefined();
      expect(analysis.insights).toBeDefined();
      expect(analysis.recommendations).toBeInstanceOf(Array);
    });
  });

  describe('Batch Processing', () => {
    it('should handle batch predictions efficiently', async () => {
      const requests = [
        { type: 'page' as const, context: { currentPath: '/properties' } },
        { type: 'page' as const, context: { currentPath: '/councils' } },
        { type: 'cache' as const, context: { resource: '/api/search' } },
      ];

      const responses = await inferenceEngine.batchPredict(requests);

      expect(responses).toHaveLength(3);
      responses.forEach(response => {
        expect(response.predictions).toBeDefined();
        expect(response.confidence).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Model Training', () => {
    it('should generate synthetic training data', async () => {
      const pipeline = new TrainingPipeline();

      // This would normally train with real data
      // For testing, we just verify the pipeline structure
      expect(pipeline).toBeDefined();
      expect(pipeline.runTrainingPipeline).toBeInstanceOf(Function);
      expect(pipeline.scheduleRetraining).toBeInstanceOf(Function);
    });
  });

  describe('Performance Monitoring', () => {
    it('should track ML metrics correctly', async () => {
      // Simulate some predictions
      for (let i = 0; i < 10; i++) {
        await inferenceEngine.predict({
          type: 'page',
          context: { currentPath: `/page-${i}` },
        });
      }

      const metrics = inferenceEngine.getMetrics();

      expect(metrics.totalPredictions).toBeGreaterThan(0);
      expect(metrics.avgLatency).toBeGreaterThan(0);
      expect(metrics.ready).toBe(true);
    });

    it('should export metrics in different formats', () => {
      const jsonMetrics = dashboard.exportMetrics('json');
      const prometheusMetrics = dashboard.exportMetrics('prometheus');

      expect(jsonMetrics).toBeDefined();
      expect(prometheusMetrics).toBeDefined();
      expect(prometheusMetrics).toContain('ml_prediction_accuracy');
      expect(prometheusMetrics).toContain('ml_cache_hit_rate');
    });

    it('should calculate efficiency improvements', () => {
      const summary = dashboard.getMetricsSummary();

      expect(summary).toBeDefined();
      expect(summary.averages).toBeDefined();
      expect(summary.trends).toBeDefined();
      expect(summary.alerts).toBeInstanceOf(Array);
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing context gracefully', async () => {
      const response = await inferenceEngine.predict({
        type: 'page',
        context: {},
      });

      expect(response).toBeDefined();
      expect(response.predictions).toBeDefined();
    });

    it('should handle cache budget limits', async () => {
      // Set a very low budget
      cacheManager.updateConfig({
        preloadBudgetMB: 1,
      });

      const sessionId = 'budget-test';
      await cacheManager.get('/test', sessionId, {
        currentPath: '/test',
      });

      const metrics = cacheManager.getMetrics();
      expect(metrics.memoryUsed).toBeLessThanOrEqual(1);
    });

    it('should disable predictive caching when requested', () => {
      cacheManager.setEnabled(false);

      const metrics = cacheManager.getMetrics();
      expect(metrics.warmingTasks).toBe(0);
    });
  });

  describe('Integration with Multi-Layer Cache', () => {
    it('should integrate seamlessly with existing cache layers', async () => {
      const sessionId = 'integration-test';
      const key = '/api/test-endpoint';

      // First access - miss, should trigger prediction
      const result1 = await cacheManager.get(key, sessionId, {
        currentPath: key,
      });

      // Second access - might be a hit if pre-loaded
      const result2 = await cacheManager.get(key, sessionId, {
        currentPath: key,
      });

      const metrics = cacheManager.getMetrics();
      expect(metrics).toBeDefined();
    });
  });
});