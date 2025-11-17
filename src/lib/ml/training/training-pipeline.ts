/**
 * ML Model Training Pipeline
 * Automated training, validation, and deployment pipeline
 */

import * as tf from '@tensorflow/tfjs-node';
import { PagePredictorModel } from '../models/page-predictor-model';
import { CacheOptimizerModel } from '../models/cache-optimizer-model';
import { FeatureExtractor } from '../features/feature-extractor';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface TrainingConfig {
  batchSize: number;
  epochs: number;
  learningRate: number;
  validationSplit: number;
  earlyStoppingPatience: number;
  targetAccuracy: number;
}

export interface TrainingData {
  features: number[][];
  labels: number[][];
  metadata: {
    totalSamples: number;
    featureDim: number;
    labelDim: number;
    timestamp: number;
  };
}

export class TrainingPipeline {
  private pagePredictorModel: PagePredictorModel;
  private cacheOptimizerModel: CacheOptimizerModel;
  private featureExtractor: FeatureExtractor;
  private supabase: any;
  private readonly modelDir = '/models';
  private readonly dataDir = '/data/training';

  constructor() {
    this.pagePredictorModel = new PagePredictorModel();
    this.cacheOptimizerModel = new CacheOptimizerModel();
    this.featureExtractor = new FeatureExtractor();

    // Initialize Supabase for data collection
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
    }
  }

  /**
   * Main training pipeline
   */
  async runTrainingPipeline(
    modelType: 'page-predictor' | 'cache-optimizer' | 'all',
    config?: Partial<TrainingConfig>
  ): Promise<{
    success: boolean;
    metrics: any;
    modelPath: string;
  }> {
    const defaultConfig: TrainingConfig = {
      batchSize: 32,
      epochs: 50,
      learningRate: 0.001,
      validationSplit: 0.2,
      earlyStoppingPatience: 5,
      targetAccuracy: 0.85,
      ...config,
    };

    console.log('Starting training pipeline:', {
      modelType,
      config: defaultConfig,
      timestamp: new Date().toISOString(),
    });

    try {
      // Step 1: Collect and prepare data
      console.log('Step 1: Collecting training data...');
      const trainingData = await this.collectTrainingData(modelType);

      // Step 2: Preprocess and augment data
      console.log('Step 2: Preprocessing data...');
      const processedData = await this.preprocessData(trainingData, modelType);

      // Step 3: Train models
      console.log('Step 3: Training models...');
      const trainingResults = await this.trainModels(
        processedData,
        modelType,
        defaultConfig
      );

      // Step 4: Validate models
      console.log('Step 4: Validating models...');
      const validationResults = await this.validateModels(
        trainingResults,
        processedData
      );

      // Step 5: Deploy if validation passes
      console.log('Step 5: Deploying models...');
      if (validationResults.passed) {
        await this.deployModels(modelType, trainingResults.modelPaths);
      }

      return {
        success: validationResults.passed,
        metrics: {
          training: trainingResults.metrics,
          validation: validationResults.metrics,
        },
        modelPath: trainingResults.modelPaths[0],
      };
    } catch (error) {
      console.error('Training pipeline failed:', error);
      return {
        success: false,
        metrics: { error: error.message },
        modelPath: '',
      };
    }
  }

  /**
   * Collect training data from various sources
   */
  private async collectTrainingData(
    modelType: string
  ): Promise<TrainingData> {
    const data: TrainingData = {
      features: [],
      labels: [],
      metadata: {
        totalSamples: 0,
        featureDim: 0,
        labelDim: 0,
        timestamp: Date.now(),
      },
    };

    if (modelType === 'page-predictor' || modelType === 'all') {
      // Collect user behavior data
      const behaviorData = await this.collectUserBehaviorData();
      data.features.push(...behaviorData.features);
      data.labels.push(...behaviorData.labels);
    }

    if (modelType === 'cache-optimizer' || modelType === 'all') {
      // Collect cache performance data
      const cacheData = await this.collectCachePerformanceData();
      data.features.push(...cacheData.features);
      data.labels.push(...cacheData.labels);
    }

    data.metadata.totalSamples = data.features.length;
    data.metadata.featureDim = data.features[0]?.length || 0;
    data.metadata.labelDim = data.labels[0]?.length || 0;

    console.log('Collected training data:', data.metadata);

    return data;
  }

  /**
   * Collect user behavior data for page prediction
   */
  private async collectUserBehaviorData(): Promise<{
    features: number[][];
    labels: number[][];
  }> {
    // In production, fetch from database
    if (this.supabase) {
      try {
        const { data: sessions } = await this.supabase
          .from('user_sessions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10000);

        if (sessions) {
          return this.processUserSessions(sessions);
        }
      } catch (error) {
        console.error('Error fetching user sessions:', error);
      }
    }

    // Generate synthetic data for demonstration
    return this.generateSyntheticUserData();
  }

  /**
   * Collect cache performance data
   */
  private async collectCachePerformanceData(): Promise<{
    features: number[][];
    labels: number[][];
  }> {
    // In production, fetch from monitoring system
    if (this.supabase) {
      try {
        const { data: cacheMetrics } = await this.supabase
          .from('cache_metrics')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(10000);

        if (cacheMetrics) {
          return this.processCacheMetrics(cacheMetrics);
        }
      } catch (error) {
        console.error('Error fetching cache metrics:', error);
      }
    }

    // Generate synthetic data for demonstration
    return this.generateSyntheticCacheData();
  }

  /**
   * Generate synthetic user behavior data
   */
  private generateSyntheticUserData(): {
    features: number[][];
    labels: number[][];
  } {
    const features: number[][] = [];
    const labels: number[][] = [];
    const numSamples = 5000;
    const featureDim = 100;
    const numPages = 1000;

    for (let i = 0; i < numSamples; i++) {
      // Generate random features
      const feature = Array.from({ length: featureDim }, () => Math.random());

      // Generate one-hot encoded label (next page)
      const label = new Array(numPages).fill(0);
      const nextPage = Math.floor(Math.random() * numPages);
      label[nextPage] = 1;

      features.push(feature);
      labels.push(label);
    }

    return { features, labels };
  }

  /**
   * Generate synthetic cache performance data
   */
  private generateSyntheticCacheData(): {
    features: number[][];
    labels: number[][];
  } {
    const features: number[][] = [];
    const labels: number[][] = [];
    const numSamples = 3000;
    const featureDim = 50;

    for (let i = 0; i < numSamples; i++) {
      // Generate random cache features
      const feature = Array.from({ length: featureDim }, () => Math.random());

      // Generate cache decision labels [shouldCache, priority, warming, invalidation]
      const shouldCache = Math.random() > 0.3 ? 1 : 0;
      const priority = Math.random();
      const warming = Math.random();
      const invalidation = Math.random() * 0.3; // Lower invalidation probability

      features.push(feature);
      labels.push([shouldCache, priority, warming, invalidation]);
    }

    return { features, labels };
  }

  /**
   * Process user sessions into features and labels
   */
  private processUserSessions(sessions: any[]): {
    features: number[][];
    labels: number[][];
  } {
    const features: number[][] = [];
    const labels: number[][] = [];

    for (const session of sessions) {
      const sessionFeatures = this.featureExtractor.extractUserFeatures(
        session,
        session.historical
      );

      // Create label from next page visited
      const nextPageLabel = this.encodePageLabel(session.next_page);

      features.push(Array.from(sessionFeatures));
      labels.push(nextPageLabel);
    }

    return { features, labels };
  }

  /**
   * Process cache metrics into features and labels
   */
  private processCacheMetrics(metrics: any[]): {
    features: number[][];
    labels: number[][];
  } {
    const features: number[][] = [];
    const labels: number[][] = [];

    for (const metric of metrics) {
      const cacheFeatures = this.featureExtractor.extractCacheFeatures(
        metric.resource,
        metric.patterns
      );

      // Create labels from actual cache performance
      const cacheLabels = [
        metric.was_cached ? 1 : 0,
        metric.access_frequency / 100,
        metric.warming_benefit || 0,
        metric.invalidation_rate || 0,
      ];

      features.push(Array.from(cacheFeatures));
      labels.push(cacheLabels);
    }

    return { features, labels };
  }

  /**
   * Preprocess and augment training data
   */
  private async preprocessData(
    data: TrainingData,
    modelType: string
  ): Promise<{
    trainFeatures: tf.Tensor2D;
    trainLabels: tf.Tensor2D;
    testFeatures: tf.Tensor2D;
    testLabels: tf.Tensor2D;
  }> {
    // Convert to tensors
    const features = tf.tensor2d(data.features);
    const labels = tf.tensor2d(data.labels);

    // Normalize features
    const { mean, variance } = tf.moments(features, 0);
    const normalizedFeatures = features.sub(mean).div(variance.sqrt().add(1e-7));

    // Split into train and test
    const splitIdx = Math.floor(data.features.length * 0.8);

    const trainFeatures = normalizedFeatures.slice([0, 0], [splitIdx, -1]);
    const trainLabels = labels.slice([0, 0], [splitIdx, -1]);

    const testFeatures = normalizedFeatures.slice([splitIdx, 0], [-1, -1]);
    const testLabels = labels.slice([splitIdx, 0], [-1, -1]);

    // Data augmentation for page predictor
    if (modelType === 'page-predictor' || modelType === 'all') {
      // Add noise for robustness
      const noise = tf.randomNormal(trainFeatures.shape, 0, 0.01);
      const augmentedFeatures = trainFeatures.add(noise);

      return {
        trainFeatures: augmentedFeatures,
        trainLabels,
        testFeatures,
        testLabels,
      };
    }

    return {
      trainFeatures,
      trainLabels,
      testFeatures,
      testLabels,
    };
  }

  /**
   * Train models with prepared data
   */
  private async trainModels(
    data: any,
    modelType: string,
    config: TrainingConfig
  ): Promise<{
    metrics: any;
    modelPaths: string[];
  }> {
    const modelPaths: string[] = [];
    const metrics: any = {};

    // Configure TensorFlow backend
    await tf.setBackend('tensorflow');

    if (modelType === 'page-predictor' || modelType === 'all') {
      console.log('Training page predictor model...');

      const history = await this.pagePredictorModel.train(
        data.trainFeatures,
        data.trainLabels,
        {
          epochs: config.epochs,
          batchSize: config.batchSize,
          validationSplit: config.validationSplit,
          callbacks: {
            onEpochEnd: (epoch, logs) => {
              console.log(`Page Predictor - Epoch ${epoch + 1}: ${JSON.stringify(logs)}`);

              // Early stopping
              if (logs?.val_acc && logs.val_acc > config.targetAccuracy) {
                console.log('Early stopping: Target accuracy reached');
                this.pagePredictorModel['model'].stopTraining = true;
              }
            },
          },
        }
      );

      metrics.pagePredictor = {
        finalLoss: history.history.loss[history.history.loss.length - 1],
        finalAccuracy: history.history.acc[history.history.acc.length - 1],
        finalValAccuracy: history.history.val_acc?.[history.history.val_acc.length - 1],
      };

      // Save model
      const modelPath = path.join(this.modelDir, 'page-predictor', `v${Date.now()}`);
      await this.pagePredictorModel.saveModel(modelPath);
      modelPaths.push(modelPath);
    }

    if (modelType === 'cache-optimizer' || modelType === 'all') {
      console.log('Training cache optimizer model...');

      // Prepare cache labels
      const cacheDecisions = data.trainLabels.slice([0, 0], [-1, 4]);
      const ttlValues = tf.randomUniform([data.trainLabels.shape[0], 1], 3, 11); // Log scale TTL

      const history = await this.cacheOptimizerModel.train(
        data.trainFeatures,
        {
          cacheDecisions,
          ttlValues,
        },
        {
          epochs: config.epochs,
          batchSize: config.batchSize,
          validationSplit: config.validationSplit,
        }
      );

      metrics.cacheOptimizer = {
        finalLoss: history.history.loss[history.history.loss.length - 1],
        cacheAccuracy: history.history.cache_output_acc?.[history.history.cache_output_acc.length - 1],
        ttlMAE: history.history.ttl_output_meanAbsoluteError?.[history.history.ttl_output_meanAbsoluteError.length - 1],
      };

      // Save model
      const modelPath = path.join(this.modelDir, 'cache-optimizer', `v${Date.now()}`);
      await this.cacheOptimizerModel.saveModel(modelPath);
      modelPaths.push(modelPath);
    }

    return { metrics, modelPaths };
  }

  /**
   * Validate trained models
   */
  private async validateModels(
    trainingResults: any,
    data: any
  ): Promise<{
    passed: boolean;
    metrics: any;
  }> {
    const validationMetrics: any = {};
    let allPassed = true;

    // Validate page predictor
    if (this.pagePredictorModel['model']) {
      const evaluation = await this.pagePredictorModel.evaluate(
        data.testFeatures,
        data.testLabels
      );

      validationMetrics.pagePredictor = evaluation;

      if (evaluation.accuracy < 0.75) {
        console.warn('Page predictor accuracy below threshold:', evaluation.accuracy);
        allPassed = false;
      }
    }

    // Validate cache optimizer
    if (this.cacheOptimizerModel['model']) {
      // Test cache optimizer predictions
      const testPredictions = await this.cacheOptimizerModel.predict(
        data.testFeatures.slice([0, 0], [1, -1]).arraySync()[0]
      );

      validationMetrics.cacheOptimizer = {
        samplePrediction: testPredictions,
      };

      if (testPredictions.priority < 0.1) {
        console.warn('Cache optimizer producing low priority scores');
      }
    }

    return {
      passed: allPassed,
      metrics: validationMetrics,
    };
  }

  /**
   * Deploy models to production
   */
  private async deployModels(
    modelType: string,
    modelPaths: string[]
  ): Promise<void> {
    console.log('Deploying models to production...');

    for (const modelPath of modelPaths) {
      // Copy to production directory
      const productionPath = modelPath.replace('/models/', '/models/production/');

      try {
        await fs.mkdir(path.dirname(productionPath), { recursive: true });
        await this.copyDirectory(modelPath, productionPath);

        console.log(`Model deployed: ${productionPath}`);

        // Update model registry
        await this.updateModelRegistry({
          path: productionPath,
          timestamp: Date.now(),
          type: modelType,
          status: 'active',
        });
      } catch (error) {
        console.error('Error deploying model:', error);
      }
    }

    // Trigger edge deployment
    await this.deployToEdge(modelPaths);
  }

  /**
   * Deploy models to edge (Cloudflare Workers)
   */
  private async deployToEdge(modelPaths: string[]): Promise<void> {
    console.log('Deploying to edge workers...');

    // In production, upload to Cloudflare R2 or KV
    // For now, log the deployment
    console.log('Edge deployment initiated for:', modelPaths);
  }

  /**
   * Update model registry
   */
  private async updateModelRegistry(modelInfo: any): Promise<void> {
    if (this.supabase) {
      try {
        await this.supabase.from('model_registry').insert(modelInfo);
      } catch (error) {
        console.error('Error updating model registry:', error);
      }
    }

    // Also update local registry
    const registryPath = path.join(this.modelDir, 'registry.json');
    try {
      const registry = await fs.readFile(registryPath, 'utf-8')
        .then(JSON.parse)
        .catch(() => ({ models: [] }));

      registry.models.push(modelInfo);
      await fs.writeFile(registryPath, JSON.stringify(registry, null, 2));
    } catch (error) {
      console.error('Error updating local registry:', error);
    }
  }

  /**
   * Schedule automated retraining
   */
  async scheduleRetraining(
    schedule: 'daily' | 'weekly' | 'monthly'
  ): Promise<void> {
    const intervals = {
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
      monthly: 30 * 24 * 60 * 60 * 1000,
    };

    const interval = intervals[schedule];

    setInterval(async () => {
      console.log(`Starting scheduled retraining (${schedule})...`);

      try {
        const result = await this.runTrainingPipeline('all');

        if (result.success) {
          console.log('Scheduled retraining completed successfully');
        } else {
          console.error('Scheduled retraining failed:', result.metrics);
        }
      } catch (error) {
        console.error('Error in scheduled retraining:', error);
      }
    }, interval);

    console.log(`Retraining scheduled: ${schedule}`);
  }

  // Helper methods

  private encodePageLabel(page: string): number[] {
    // Simple one-hot encoding for demonstration
    const numPages = 1000;
    const label = new Array(numPages).fill(0);
    const pageHash = this.hashString(page) % numPages;
    label[pageHash] = 1;
    return label;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
}

export const trainingPipeline = new TrainingPipeline();