/**
 * TensorFlow.js Cache Optimization Model
 * Predicts optimal caching strategies and TTL values
 */

import * as tf from '@tensorflow/tfjs';

export interface CacheOptimization {
  resource: string;
  shouldCache: boolean;
  priority: number;
  optimalTTL: number;
  warmingScore: number;
  invalidationProbability: number;
}

export class CacheOptimizerModel {
  private model: tf.LayersModel | null = null;
  private ttlModel: tf.LayersModel | null = null;
  private readonly modelPath = '/models/cache-optimizer';

  /**
   * Build cache decision model
   */
  buildCacheModel(inputDim: number = 50): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        // Input processing
        tf.layers.dense({
          inputShape: [inputDim],
          units: 128,
          activation: 'relu',
          kernelInitializer: 'heNormal',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }),
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.batchNormalization(),

        // Feature extraction
        tf.layers.dense({
          units: 256,
          activation: 'relu',
          kernelInitializer: 'heNormal',
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.batchNormalization(),

        // Decision layers
        tf.layers.dense({
          units: 128,
          activation: 'relu',
          kernelInitializer: 'heNormal',
        }),
        tf.layers.dropout({ rate: 0.15 }),

        // Multi-output heads
        // Output: [shouldCache, priority, warmingScore, invalidationProb]
        tf.layers.dense({
          units: 4,
          activation: 'sigmoid',
          name: 'cache_decisions',
        }),
      ],
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy', 'precision', 'recall'],
    });

    return model;
  }

  /**
   * Build TTL prediction model
   */
  buildTTLModel(inputDim: number = 50): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        // Input layer
        tf.layers.dense({
          inputShape: [inputDim],
          units: 64,
          activation: 'relu',
          kernelInitializer: 'heNormal',
        }),
        tf.layers.dropout({ rate: 0.2 }),

        // Hidden layers for TTL regression
        tf.layers.dense({
          units: 128,
          activation: 'relu',
          kernelInitializer: 'heNormal',
        }),
        tf.layers.dropout({ rate: 0.2 }),

        tf.layers.dense({
          units: 64,
          activation: 'relu',
          kernelInitializer: 'heNormal',
        }),

        // Output: TTL in seconds (log scale)
        tf.layers.dense({
          units: 1,
          activation: 'linear',
          name: 'ttl_prediction',
        }),
      ],
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'meanSquaredError',
      metrics: ['meanAbsoluteError'],
    });

    return model;
  }

  /**
   * Build ensemble model for comprehensive optimization
   */
  buildEnsembleModel(inputDim: number = 50): tf.LayersModel {
    // Input layer
    const input = tf.input({ shape: [inputDim] });

    // Shared feature extraction
    let x = tf.layers.dense({
      units: 128,
      activation: 'relu',
      kernelInitializer: 'heNormal',
    }).apply(input) as tf.SymbolicTensor;

    x = tf.layers.dropout({ rate: 0.2 }).apply(x) as tf.SymbolicTensor;
    x = tf.layers.batchNormalization().apply(x) as tf.SymbolicTensor;

    // Branch for cache decisions
    let cacheDecision = tf.layers.dense({
      units: 64,
      activation: 'relu',
    }).apply(x) as tf.SymbolicTensor;

    cacheDecision = tf.layers.dense({
      units: 32,
      activation: 'relu',
    }).apply(cacheDecision) as tf.SymbolicTensor;

    const cacheOutput = tf.layers.dense({
      units: 4,
      activation: 'sigmoid',
      name: 'cache_output',
    }).apply(cacheDecision) as tf.SymbolicTensor;

    // Branch for TTL prediction
    let ttlPrediction = tf.layers.dense({
      units: 64,
      activation: 'relu',
    }).apply(x) as tf.SymbolicTensor;

    ttlPrediction = tf.layers.dense({
      units: 32,
      activation: 'relu',
    }).apply(ttlPrediction) as tf.SymbolicTensor;

    const ttlOutput = tf.layers.dense({
      units: 1,
      activation: 'linear',
      name: 'ttl_output',
    }).apply(ttlPrediction) as tf.SymbolicTensor;

    // Create model with multiple outputs
    const model = tf.model({
      inputs: input,
      outputs: [cacheOutput, ttlOutput],
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: {
        cache_output: 'binaryCrossentropy',
        ttl_output: 'meanSquaredError',
      },
      lossWeights: {
        cache_output: 1.0,
        ttl_output: 0.5,
      },
      metrics: {
        cache_output: ['accuracy'],
        ttl_output: ['meanAbsoluteError'],
      },
    });

    return model;
  }

  /**
   * Train cache optimization model
   */
  async train(
    features: tf.Tensor2D,
    labels: {
      cacheDecisions: tf.Tensor2D;
      ttlValues: tf.Tensor2D;
    },
    options: {
      epochs?: number;
      batchSize?: number;
      validationSplit?: number;
    } = {}
  ): Promise<tf.History> {
    const {
      epochs = 30,
      batchSize = 32,
      validationSplit = 0.2,
    } = options;

    if (!this.model) {
      this.model = this.buildEnsembleModel(features.shape[1] as number);
    }

    // Train with both outputs
    const history = await this.model.fit(
      features,
      [labels.cacheDecisions, labels.ttlValues],
      {
        epochs,
        batchSize,
        validationSplit,
        shuffle: true,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            console.log(`Cache Optimizer - Epoch ${epoch + 1}/${epochs}`);
            console.log(`Cache Acc: ${logs?.cache_output_acc?.toFixed(4)}`);
            console.log(`TTL MAE: ${logs?.ttl_output_meanAbsoluteError?.toFixed(2)}`);
          },
        },
      }
    );

    return history;
  }

  /**
   * Predict cache optimizations
   */
  async predict(
    features: Float32Array | tf.Tensor2D
  ): Promise<CacheOptimization> {
    if (!this.model) {
      throw new Error('Model not loaded');
    }

    // Convert to tensor if needed
    const inputTensor = features instanceof Float32Array
      ? tf.tensor2d([features])
      : features;

    // Get predictions from ensemble model
    const predictions = this.model.predict(inputTensor) as tf.Tensor[];
    const [cacheDecisions, ttlPrediction] = predictions;

    // Extract values
    const cacheValues = await (cacheDecisions as tf.Tensor2D).array();
    const ttlValue = await (ttlPrediction as tf.Tensor2D).array();

    // Clean up
    if (features instanceof Float32Array) {
      inputTensor.dispose();
    }
    cacheDecisions.dispose();
    ttlPrediction.dispose();

    const [shouldCache, priority, warmingScore, invalidationProb] = cacheValues[0];
    const ttlSeconds = Math.exp(ttlValue[0][0]); // Convert from log scale

    return {
      resource: '', // Will be filled by caller
      shouldCache: shouldCache > 0.5,
      priority: priority,
      optimalTTL: Math.min(Math.max(ttlSeconds, 60), 86400), // 1 min to 1 day
      warmingScore: warmingScore,
      invalidationProbability: invalidationProb,
    };
  }

  /**
   * Batch prediction for multiple resources
   */
  async batchPredict(
    featuresBatch: Float32Array[],
    resources: string[]
  ): Promise<CacheOptimization[]> {
    if (!this.model) {
      throw new Error('Model not loaded');
    }

    // Stack features
    const batchTensor = tf.stack(featuresBatch.map(f => tf.tensor1d(f)));

    // Predict
    const predictions = this.model.predict(batchTensor) as tf.Tensor[];
    const [cacheDecisions, ttlPredictions] = predictions;

    const cacheValues = await (cacheDecisions as tf.Tensor2D).array();
    const ttlValues = await (ttlPredictions as tf.Tensor2D).array();

    // Clean up
    batchTensor.dispose();
    cacheDecisions.dispose();
    ttlPredictions.dispose();

    // Process results
    const results: CacheOptimization[] = [];

    for (let i = 0; i < resources.length; i++) {
      const [shouldCache, priority, warmingScore, invalidationProb] = cacheValues[i];
      const ttlSeconds = Math.exp(ttlValues[i][0]);

      results.push({
        resource: resources[i],
        shouldCache: shouldCache > 0.5,
        priority: priority,
        optimalTTL: Math.min(Math.max(ttlSeconds, 60), 86400),
        warmingScore: warmingScore,
        invalidationProbability: invalidationProb,
      });
    }

    return results;
  }

  /**
   * Analyze cache efficiency
   */
  async analyzeCacheEfficiency(
    currentHitRate: number,
    currentSize: number,
    maxSize: number,
    resourceFeatures: Float32Array[]
  ): Promise<{
    efficiencyScore: number;
    recommendations: string[];
    optimalSize: number;
    predictedHitRate: number;
  }> {
    // Predict optimal configurations for all resources
    const optimizations = await this.batchPredict(
      resourceFeatures,
      resourceFeatures.map((_, i) => `resource_${i}`)
    );

    // Calculate efficiency metrics
    const avgPriority = optimizations.reduce((sum, opt) => sum + opt.priority, 0) / optimizations.length;
    const cacheableResources = optimizations.filter(opt => opt.shouldCache).length;
    const totalResources = optimizations.length;

    // Calculate efficiency score
    const hitRateScore = currentHitRate;
    const sizeUtilization = currentSize / maxSize;
    const cacheabilityScore = cacheableResources / totalResources;

    const efficiencyScore = (
      hitRateScore * 0.5 +
      (1 - sizeUtilization) * 0.2 +
      cacheabilityScore * 0.3
    );

    // Generate recommendations
    const recommendations: string[] = [];

    if (currentHitRate < 0.9) {
      recommendations.push('Increase cache warming for high-priority resources');
    }

    if (sizeUtilization > 0.8) {
      recommendations.push('Consider increasing cache size or implementing more aggressive eviction');
    }

    const highWarmingResources = optimizations.filter(opt => opt.warmingScore > 0.7);
    if (highWarmingResources.length > 10) {
      recommendations.push(`Pre-warm ${highWarmingResources.length} high-value resources`);
    }

    const highInvalidation = optimizations.filter(opt => opt.invalidationProbability > 0.5);
    if (highInvalidation.length > 0) {
      recommendations.push(`Monitor ${highInvalidation.length} resources for staleness`);
    }

    // Calculate optimal size based on priorities
    const prioritySum = optimizations
      .filter(opt => opt.shouldCache)
      .reduce((sum, opt) => sum + opt.priority, 0);

    const optimalSize = Math.min(
      maxSize,
      Math.ceil(currentSize * (prioritySum / cacheableResources))
    );

    // Predict new hit rate with optimizations
    const predictedHitRate = Math.min(
      0.995,
      currentHitRate + (avgPriority * 0.1)
    );

    return {
      efficiencyScore,
      recommendations,
      optimalSize,
      predictedHitRate,
    };
  }

  /**
   * Get model insights
   */
  async getModelInsights(): Promise<{
    featureImportance: Record<string, number>;
    decisionBoundaries: number[];
    optimalThresholds: {
      cacheThreshold: number;
      warmingThreshold: number;
      invalidationThreshold: number;
    };
  }> {
    // Analyze model weights to determine feature importance
    if (!this.model) {
      throw new Error('Model not loaded');
    }

    // Get first layer weights
    const firstLayer = this.model.layers[0];
    const weights = await firstLayer.getWeights()[0].array();

    // Calculate feature importance based on weight magnitudes
    const importance: Record<string, number> = {};
    const featureNames = [
      'access_frequency',
      'resource_size',
      'computation_cost',
      'data_volatility',
      'user_segment_distribution',
      'peak_access_time',
      'ttl_efficiency',
    ];

    // Simplified importance calculation
    for (let i = 0; i < Math.min(featureNames.length, 7); i++) {
      const weightMagnitude = Math.abs(weights[i][0]);
      importance[featureNames[i]] = weightMagnitude;
    }

    return {
      featureImportance: importance,
      decisionBoundaries: [0.5, 0.7, 0.3],
      optimalThresholds: {
        cacheThreshold: 0.6,
        warmingThreshold: 0.75,
        invalidationThreshold: 0.4,
      },
    };
  }

  /**
   * Save model
   */
  async saveModel(path?: string): Promise<void> {
    if (!this.model) {
      throw new Error('No model to save');
    }

    const savePath = path || this.modelPath;
    await this.model.save(`file://${savePath}`);
    console.log('Cache optimizer model saved to:', savePath);
  }

  /**
   * Load model
   */
  async loadModel(path?: string): Promise<void> {
    const loadPath = path || this.modelPath;

    try {
      this.model = await tf.loadLayersModel(`file://${loadPath}/model.json`);
      console.log('Cache optimizer model loaded from:', loadPath);
    } catch (error) {
      console.error('Error loading model, building new one:', error);
      this.model = this.buildEnsembleModel();
    }
  }
}

export const cacheOptimizerModel = new CacheOptimizerModel();