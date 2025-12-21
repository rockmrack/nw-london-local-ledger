/**
 * ML-Powered Predictive Caching System
 * Main entry point for ML functionality
 *
 * IMPORTANT: All exports use lazy loading to prevent TensorFlow imports during build
 */

// Type-only exports (safe - don't load modules)
export type { PredictiveCacheManager } from './predictive-cache-manager';
export type { InferenceEngine } from './inference/inference-engine';
export type { TrainingPipeline } from './training/training-pipeline';
export type { FeatureExtractor } from './features/feature-extractor';
export type { PagePredictorModel } from './models/page-predictor-model';
export type { CacheOptimizerModel } from './models/cache-optimizer-model';
export type { MLMetricsDashboard } from './monitoring/ml-metrics-dashboard';

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

// Lazy-loaded singleton instances - these don't import the modules until accessed
let _predictiveCacheManager: any = null;
let _inferenceEngine: any = null;
let _trainingPipeline: any = null;
let _featureExtractor: any = null;
let _pagePredictorModel: any = null;
let _cacheOptimizerModel: any = null;
let _mlMetricsDashboard: any = null;

export const predictiveCacheManager = new Proxy({} as any, {
  get(target, prop) {
    if (!_predictiveCacheManager) {
      throw new Error('predictiveCacheManager not initialized. Call initializeMLSystem() first or use dynamic import.');
    }
    return _predictiveCacheManager[prop];
  }
});

export const inferenceEngine = new Proxy({} as any, {
  get(target, prop) {
    if (!_inferenceEngine) {
      throw new Error('inferenceEngine not initialized. Call initializeMLSystem() first or use dynamic import.');
    }
    return _inferenceEngine[prop];
  }
});

export const trainingPipeline = new Proxy({} as any, {
  get(target, prop) {
    if (!_trainingPipeline) {
      throw new Error('trainingPipeline not initialized. Call initializeMLSystem() first or use dynamic import.');
    }
    return _trainingPipeline[prop];
  }
});

export const featureExtractor = new Proxy({} as any, {
  get(target, prop) {
    if (!_featureExtractor) {
      throw new Error('featureExtractor not initialized. Call initializeMLSystem() first or use dynamic import.');
    }
    return _featureExtractor[prop];
  }
});

export const pagePredictorModel = new Proxy({} as any, {
  get(target, prop) {
    if (!_pagePredictorModel) {
      throw new Error('pagePredictorModel not initialized. Call initializeMLSystem() first or use dynamic import.');
    }
    return _pagePredictorModel[prop];
  }
});

export const cacheOptimizerModel = new Proxy({} as any, {
  get(target, prop) {
    if (!_cacheOptimizerModel) {
      throw new Error('cacheOptimizerModel not initialized. Call initializeMLSystem() first or use dynamic import.');
    }
    return _cacheOptimizerModel[prop];
  }
});

export const mlMetricsDashboard = new Proxy({} as any, {
  get(target, prop) {
    if (!_mlMetricsDashboard) {
      throw new Error('mlMetricsDashboard not initialized. Call initializeMLSystem() first or use dynamic import.');
    }
    return _mlMetricsDashboard[prop];
  }
});

// Initialize ML system - dynamically loads all modules
export async function initializeMLSystem(config?: {
  enablePredictiveCache?: boolean;
  enableEdgeInference?: boolean;
  enableAutoTraining?: boolean;
  edgeInferenceUrl?: string;
}): Promise<void> {
  console.log('Initializing ML-powered predictive caching system...');

  // Dynamically import all modules
  const [
    { predictiveCacheManager: pcm },
    { inferenceEngine: ie },
    { trainingPipeline: tp },
    { featureExtractor: fe },
    { pagePredictorModel: ppm },
    { cacheOptimizerModel: com },
    { mlMetricsDashboard: mmd },
  ] = await Promise.all([
    import('./predictive-cache-manager'),
    import('./inference/inference-engine'),
    import('./training/training-pipeline'),
    import('./features/feature-extractor'),
    import('./models/page-predictor-model'),
    import('./models/cache-optimizer-model'),
    import('./monitoring/ml-metrics-dashboard'),
  ]);

  _predictiveCacheManager = pcm;
  _inferenceEngine = ie;
  _trainingPipeline = tp;
  _featureExtractor = fe;
  _pagePredictorModel = ppm;
  _cacheOptimizerModel = com;
  _mlMetricsDashboard = mmd;

  const {
    enablePredictiveCache = true,
    enableEdgeInference = false,
    enableAutoTraining = false,
    edgeInferenceUrl,
  } = config || {};

  // Initialize inference engine
  await _inferenceEngine.initialize();

  // Configure predictive cache manager
  if (enablePredictiveCache) {
    _predictiveCacheManager.updateConfig({
      enabled: true,
      edgeInferenceUrl: enableEdgeInference ? edgeInferenceUrl : undefined,
    });
  }

  // Schedule auto training if enabled
  if (enableAutoTraining) {
    _trainingPipeline.scheduleRetraining('weekly');
  }

  // Start metrics collection
  _mlMetricsDashboard.startMetricsCollection();

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
    initialized: _predictiveCacheManager !== null,
    predictiveCacheEnabled: _predictiveCacheManager?.['config']?.enabled || false,
    modelsLoaded: _inferenceEngine?.['isReady'] || false,
    metrics: _mlMetricsDashboard?.getMetricsSummary() || null,
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
  if (!_trainingPipeline) {
    throw new Error('Training pipeline not initialized');
  }

  console.log(`Starting manual training for ${modelType}...`);

  const result = await _trainingPipeline.runTrainingPipeline(modelType, {
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
  if (!_inferenceEngine) {
    throw new Error('Inference engine not initialized');
  }

  // Get page predictions
  const pageResponse = await _inferenceEngine.predict({
    type: 'page',
    context,
    options: { topK: 5 },
  });

  // Get cache optimizations for each predicted page
  const cacheOptimizations: Record<string, any> = {};

  for (const page of pageResponse.predictions) {
    const cacheResponse = await _inferenceEngine.predict({
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
  if (!_predictiveCacheManager) {
    throw new Error('Predictive cache manager not initialized');
  }

  const analysis = await _predictiveCacheManager.analyzeCachePerformance();

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
  if (!_mlMetricsDashboard) {
    throw new Error('ML metrics dashboard not initialized');
  }
  return _mlMetricsDashboard.exportMetrics(format);
}

// Skip auto-initialization to prevent TensorFlow loading during build
// ML routes will initialize when first called
