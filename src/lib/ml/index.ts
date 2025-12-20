/**
 * ML-Powered Predictive Caching System
 * Main entry point for ML functionality
 */

// Core exports
export { PredictiveCacheManager, predictiveCacheManager } from './predictive-cache-manager';
export { InferenceEngine, inferenceEngine } from './inference/inference-engine';
export { TrainingPipeline, trainingPipeline } from './training/training-pipeline';
export { FeatureExtractor, featureExtractor } from './features/feature-extractor';

// Models
export { PagePredictorModel, pagePredictorModel } from './models/page-predictor-model';
export { CacheOptimizerModel, cacheOptimizerModel } from './models/cache-optimizer-model';

// Monitoring
export { MLMetricsDashboard, mlMetricsDashboard } from './monitoring/ml-metrics-dashboard';

// Types
export type {
  PredictiveCacheConfig,
  CacheWarmingTask,
  PredictiveCacheMetrics,
} from './predictive-cache-manager';

export type {
  PredictionRequest,
  PredictionResponse,
} from './inference/inference-engine';

export type {
  TrainingConfig,
  TrainingData,
} from './training/training-pipeline';

export type {
  UserBehaviorFeatures,
  PageTransitionFeatures,
  CachePerformanceFeatures,
} from './features/feature-extractor';

export type {
  PagePrediction,
} from './models/page-predictor-model';

export type {
  CacheOptimization,
} from './models/cache-optimizer-model';

export type {
  MLDashboardMetrics,
  AlertConfig,
} from './monitoring/ml-metrics-dashboard';

// Initialize ML system
export async function initializeMLSystem(config?: {
  enablePredictiveCache?: boolean;
  enableEdgeInference?: boolean;
  enableAutoTraining?: boolean;
  edgeInferenceUrl?: string;
}): Promise<void> {
  console.log('Initializing ML-powered predictive caching system...');

  const {
    enablePredictiveCache = true,
    enableEdgeInference = false,
    enableAutoTraining = false,
    edgeInferenceUrl,
  } = config || {};

  // Initialize inference engine
  await inferenceEngine.initialize();

  // Configure predictive cache manager
  if (enablePredictiveCache) {
    predictiveCacheManager.updateConfig({
      enabled: true,
      edgeInferenceUrl: enableEdgeInference ? edgeInferenceUrl : undefined,
    });
  }

  // Schedule auto training if enabled
  if (enableAutoTraining) {
    trainingPipeline.scheduleRetraining('weekly');
  }

  // Start metrics collection
  mlMetricsDashboard.startMetricsCollection();

  console.log('ML system initialized successfully');
}

// Utility functions

/**
 * Get ML system status
 */
export function getMLSystemStatus(): {
  initialized: boolean;
  predictiveCacheEnabled: boolean;
  modelsLoaded: boolean;
  metrics: any;
} {
  return {
    initialized: true,
    predictiveCacheEnabled: predictiveCacheManager['config'].enabled,
    modelsLoaded: inferenceEngine['isReady'],
    metrics: mlMetricsDashboard.getMetricsSummary(),
  };
}

/**
 * Train models manually
 */
export async function trainModels(
  modelType: 'page-predictor' | 'cache-optimizer' | 'all' = 'all'
): Promise<{
  success: boolean;
  metrics: any;
}> {
  console.log(`Starting manual training for ${modelType}...`);

  const result = await trainingPipeline.runTrainingPipeline(modelType, {
    epochs: 30,
    batchSize: 32,
    targetAccuracy: 0.85,
  });

  return {
    success: result.success,
    metrics: result.metrics,
  };
}

/**
 * Get predictive cache recommendations for a session
 */
export async function getPredictiveCacheRecommendations(
  sessionId: string,
  context: any
): Promise<{
  pagesToPreload: string[];
  resourcesToCache: string[];
  optimalTTLs: Record<string, number>;
}> {
  // Get page predictions
  const pageResponse = await inferenceEngine.predict({
    type: 'page',
    context,
    options: { topK: 5 },
  });

  // Get cache optimizations for each predicted page
  const cacheOptimizations: Record<string, any> = {};

  for (const page of pageResponse.predictions) {
    const cacheResponse = await inferenceEngine.predict({
      type: 'cache',
      context: { resource: page.page },
    });

    if (cacheResponse.predictions[0]) {
      cacheOptimizations[page.page] = cacheResponse.predictions[0];
    }
  }

  // Filter and prepare recommendations
  const pagesToPreload = pageResponse.predictions
    .filter(p => p.probability > 0.7)
    .map(p => p.page);

  const resourcesToCache = Object.entries(cacheOptimizations)
    .filter(([_, opt]) => opt.shouldCache)
    .map(([resource, _]) => resource);

  const optimalTTLs = Object.entries(cacheOptimizations)
    .reduce((acc, [resource, opt]) => {
      acc[resource] = opt.optimalTTL;
      return acc;
    }, {} as Record<string, number>);

  return {
    pagesToPreload,
    resourcesToCache,
    optimalTTLs,
  };
}

/**
 * Analyze cache performance with ML insights
 */
export async function analyzeCachePerformance(): Promise<{
  currentPerformance: any;
  mlInsights: any;
  recommendations: string[];
  projectedImprovement: number;
}> {
  const analysis = await predictiveCacheManager.analyzeCachePerformance();

  // Calculate projected improvement
  const currentHitRate = analysis.metrics.cacheMetrics?.overall?.overallHitRate || 0.95;
  const projectedHitRate = Math.min(0.995, currentHitRate + 0.03);
  const projectedImprovement = ((projectedHitRate - currentHitRate) / currentHitRate) * 100;

  return {
    currentPerformance: analysis.metrics,
    mlInsights: analysis.insights,
    recommendations: analysis.recommendations,
    projectedImprovement,
  };
}

/**
 * Export metrics for monitoring
 */
export function exportMLMetrics(format: 'prometheus' | 'json' = 'json'): string {
  return mlMetricsDashboard.exportMetrics(format);
}

// Default initialization - skip during build
if (typeof window === 'undefined' && process.env.NODE_ENV === 'production' && !process.env.SKIP_ML_BUILD) {
  // Server-side initialization
  initializeMLSystem({
    enablePredictiveCache: true,
    enableEdgeInference: false,
    enableAutoTraining: false,
  }).catch(error => {
    console.error('Failed to initialize ML system:', error);
  });
}