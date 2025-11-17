import * as tf from '@tensorflow/tfjs-node';
import { LRUCache } from 'lru-cache';
import { EventEmitter } from 'events';
import crypto from 'crypto';

// User behavior patterns for ML training
interface UserBehavior {
  userId: string;
  sessionId: string;
  timestamp: number;
  pageView: string;
  previousPage: string;
  timeOnPage: number;
  deviceType: string;
  connectionSpeed: string;
  location: {
    council: string;
    postcode: string;
  };
  searchTerms: string[];
  propertyViews: string[];
  interactions: {
    clicks: number;
    scrollDepth: number;
    formSubmissions: number;
  };
}

// ML-based predictive caching system
export class MLCachePredictor extends EventEmitter {
  private model: tf.LayersModel | null = null;
  private userBehaviorCache: LRUCache<string, UserBehavior[]>;
  private predictionCache: LRUCache<string, any>;
  private featureExtractor: FeatureExtractor;
  private isTraining = false;
  private modelVersion = '1.0.0';

  constructor() {
    super();

    this.userBehaviorCache = new LRUCache({
      max: 10000,
      ttl: 1000 * 60 * 60, // 1 hour
    });

    this.predictionCache = new LRUCache({
      max: 5000,
      ttl: 1000 * 60 * 15, // 15 minutes
    });

    this.featureExtractor = new FeatureExtractor();
    this.initializeModel();
    this.startContinuousLearning();
  }

  // Initialize the neural network model
  private async initializeModel() {
    try {
      // Try to load existing model
      this.model = await tf.loadLayersModel(
        `file:///var/models/cache-predictor/${this.modelVersion}/model.json`
      );
      console.log('Loaded existing ML cache predictor model');
    } catch (error) {
      // Create new model if none exists
      this.model = this.createModel();
      console.log('Created new ML cache predictor model');
    }
  }

  // Create neural network architecture
  private createModel(): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        // Input layer
        tf.layers.dense({
          inputShape: [50], // 50 features
          units: 128,
          activation: 'relu',
          kernelInitializer: 'heNormal',
        }),

        // Dropout for regularization
        tf.layers.dropout({ rate: 0.2 }),

        // Hidden layers
        tf.layers.dense({
          units: 256,
          activation: 'relu',
          kernelInitializer: 'heNormal',
        }),

        tf.layers.dropout({ rate: 0.3 }),

        tf.layers.dense({
          units: 128,
          activation: 'relu',
          kernelInitializer: 'heNormal',
        }),

        tf.layers.dropout({ rate: 0.2 }),

        // Output layer - predicts multiple cache targets
        tf.layers.dense({
          units: 100, // Top 100 cacheable items
          activation: 'sigmoid',
        }),
      ],
    });

    // Compile with Adam optimizer
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy', 'precision', 'recall'],
    });

    return model;
  }

  // Predict what to cache based on user behavior
  public async predictCacheTargets(behavior: UserBehavior): Promise<string[]> {
    if (!this.model) {
      return this.getFallbackPredictions(behavior);
    }

    const cacheKey = this.generateBehaviorKey(behavior);
    const cached = this.predictionCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      // Extract features from user behavior
      const features = await this.featureExtractor.extract(behavior);
      const input = tf.tensor2d([features], [1, 50]);

      // Get predictions
      const predictions = this.model.predict(input) as tf.Tensor;
      const probabilities = await predictions.data();

      // Get top predictions above threshold
      const threshold = 0.6;
      const targets: string[] = [];

      for (let i = 0; i < probabilities.length; i++) {
        if (probabilities[i] > threshold) {
          const target = await this.mapPredictionToTarget(i, behavior);
          if (target) {
            targets.push(target);
          }
        }
      }

      // Clean up tensors
      input.dispose();
      predictions.dispose();

      // Cache predictions
      this.predictionCache.set(cacheKey, targets);

      // Emit prediction event for monitoring
      this.emit('prediction', {
        userId: behavior.userId,
        targets: targets.length,
        confidence: Math.max(...probabilities),
      });

      return targets;
    } catch (error) {
      console.error('ML prediction error:', error);
      return this.getFallbackPredictions(behavior);
    }
  }

  // Map prediction index to actual cache target
  private async mapPredictionToTarget(
    index: number,
    behavior: UserBehavior
  ): Promise<string | null> {
    const targetMappings = [
      // Page predictions (0-29)
      ...Array(30)
        .fill(0)
        .map((_, i) => `page:/properties?council=${behavior.location.council}&page=${i + 1}`),

      // Property predictions (30-59)
      ...Array(30)
        .fill(0)
        .map((_, i) => `property:${behavior.location.council}:${i}`),

      // Search predictions (60-79)
      ...Array(20)
        .fill(0)
        .map((_, i) => `search:${behavior.searchTerms[i % behavior.searchTerms.length]}`),

      // API predictions (80-99)
      ...Array(20)
        .fill(0)
        .map((_, i) => `api:/api/properties?filter=${i}`),
    ];

    return index < targetMappings.length ? targetMappings[index] : null;
  }

  // Fallback predictions when ML is unavailable
  private getFallbackPredictions(behavior: UserBehavior): string[] {
    const predictions: string[] = [];

    // Predict next page based on current page
    if (behavior.pageView.includes('/properties')) {
      const currentPage = parseInt(behavior.pageView.match(/page=(\d+)/)?.[1] || '1');
      predictions.push(`page:/properties?council=${behavior.location.council}&page=${currentPage + 1}`);
    }

    // Predict related properties
    if (behavior.propertyViews.length > 0) {
      const lastProperty = behavior.propertyViews[behavior.propertyViews.length - 1];
      predictions.push(`related:${lastProperty}`);
    }

    // Predict search results
    if (behavior.searchTerms.length > 0) {
      behavior.searchTerms.slice(-3).forEach((term) => {
        predictions.push(`search:${term}`);
      });
    }

    return predictions;
  }

  // Train model with new user behavior data
  public async train(behaviors: UserBehavior[], outcomes: number[][]): Promise<void> {
    if (this.isTraining || !this.model) {
      return;
    }

    this.isTraining = true;

    try {
      // Prepare training data
      const features = await Promise.all(
        behaviors.map((b) => this.featureExtractor.extract(b))
      );

      const xs = tf.tensor2d(features);
      const ys = tf.tensor2d(outcomes);

      // Train model
      const history = await this.model.fit(xs, ys, {
        epochs: 10,
        batchSize: 32,
        validationSplit: 0.2,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            console.log(`Training epoch ${epoch}:`, logs);
            this.emit('training', { epoch, logs });
          },
        },
      });

      // Clean up tensors
      xs.dispose();
      ys.dispose();

      // Save updated model
      await this.saveModel();

      this.emit('trained', {
        samples: behaviors.length,
        accuracy: history.history.acc[history.history.acc.length - 1],
      });
    } catch (error) {
      console.error('Training error:', error);
    } finally {
      this.isTraining = false;
    }
  }

  // Continuous learning from user interactions
  private startContinuousLearning() {
    setInterval(async () => {
      if (this.isTraining) {
        return;
      }

      // Collect recent behaviors for training
      const recentBehaviors: UserBehavior[] = [];
      const outcomes: number[][] = [];

      this.userBehaviorCache.forEach((behaviors) => {
        behaviors.forEach((behavior) => {
          recentBehaviors.push(behavior);
          // Generate outcome based on actual cache hits
          outcomes.push(this.generateOutcome(behavior));
        });
      });

      if (recentBehaviors.length >= 100) {
        await this.train(recentBehaviors.slice(-1000), outcomes.slice(-1000));
      }
    }, 1000 * 60 * 30); // Every 30 minutes
  }

  // Generate training outcome based on actual cache performance
  private generateOutcome(behavior: UserBehavior): number[] {
    // This would be populated by actual cache hit data
    const outcome = new Array(100).fill(0);

    // Mark successful cache predictions
    behavior.propertyViews.forEach((view, index) => {
      if (index < 30) {
        outcome[30 + index] = 1;
      }
    });

    return outcome;
  }

  // Save model to disk
  private async saveModel() {
    if (!this.model) {
      return;
    }

    try {
      await this.model.save(
        `file:///var/models/cache-predictor/${this.modelVersion}/model.json`
      );
      console.log('ML model saved successfully');
    } catch (error) {
      console.error('Failed to save model:', error);
    }
  }

  // Generate unique key for behavior
  private generateBehaviorKey(behavior: UserBehavior): string {
    const hash = crypto.createHash('md5');
    hash.update(
      JSON.stringify({
        userId: behavior.userId,
        page: behavior.pageView,
        council: behavior.location.council,
        device: behavior.deviceType,
      })
    );
    return hash.digest('hex');
  }

  // Record user behavior for training
  public recordBehavior(behavior: UserBehavior) {
    const behaviors = this.userBehaviorCache.get(behavior.userId) || [];
    behaviors.push(behavior);
    this.userBehaviorCache.set(behavior.userId, behaviors.slice(-50));
  }

  // Get model statistics
  public getStats() {
    return {
      modelVersion: this.modelVersion,
      isTraining: this.isTraining,
      behaviorCacheSize: this.userBehaviorCache.size,
      predictionCacheSize: this.predictionCache.size,
      modelLoaded: this.model !== null,
    };
  }
}

// Feature extraction from user behavior
class FeatureExtractor {
  // Extract numerical features from behavior
  public async extract(behavior: UserBehavior): Promise<number[]> {
    const features: number[] = [];

    // Time features (0-9)
    const hour = new Date(behavior.timestamp).getHours();
    const dayOfWeek = new Date(behavior.timestamp).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 ? 1 : 0;

    features.push(
      hour / 24,
      dayOfWeek / 7,
      isWeekend,
      behavior.timeOnPage / 3600000, // Normalize to hours
      behavior.interactions.clicks / 100,
      behavior.interactions.scrollDepth,
      behavior.interactions.formSubmissions / 10,
      0, 0, 0 // Padding
    );

    // Device and connection features (10-19)
    features.push(
      behavior.deviceType === 'mobile' ? 1 : 0,
      behavior.deviceType === 'tablet' ? 1 : 0,
      behavior.deviceType === 'desktop' ? 1 : 0,
      behavior.connectionSpeed === 'slow' ? 1 : 0,
      behavior.connectionSpeed === 'fast' ? 1 : 0,
      0, 0, 0, 0, 0 // Padding
    );

    // Location features (20-29)
    const councilHash = this.hashString(behavior.location.council);
    const postcodeHash = this.hashString(behavior.location.postcode);

    features.push(
      councilHash,
      postcodeHash,
      0, 0, 0, 0, 0, 0, 0, 0 // Padding
    );

    // Page and navigation features (30-39)
    const pageHash = this.hashString(behavior.pageView);
    const prevPageHash = this.hashString(behavior.previousPage);

    features.push(
      pageHash,
      prevPageHash,
      behavior.propertyViews.length / 100,
      behavior.searchTerms.length / 10,
      0, 0, 0, 0, 0, 0 // Padding
    );

    // Search and interaction features (40-49)
    const searchHash = behavior.searchTerms.length > 0
      ? this.hashString(behavior.searchTerms.join(' '))
      : 0;

    features.push(
      searchHash,
      0, 0, 0, 0, 0, 0, 0, 0, 0 // Padding
    );

    // Ensure exactly 50 features
    return features.slice(0, 50);
  }

  // Hash string to number between 0 and 1
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash) / 2147483647;
  }
}

// Anomaly detection for performance issues
export class PerformanceAnomalyDetector {
  private model: tf.LayersModel | null = null;
  private metricsHistory: Map<string, number[]> = new Map();
  private anomalyThreshold = 2.5; // Standard deviations

  constructor() {
    this.initializeModel();
    this.startMonitoring();
  }

  private async initializeModel() {
    // Autoencoder for anomaly detection
    const encoder = tf.sequential({
      layers: [
        tf.layers.dense({
          inputShape: [20], // Performance metrics
          units: 10,
          activation: 'relu',
        }),
        tf.layers.dense({
          units: 5,
          activation: 'relu',
        }),
      ],
    });

    const decoder = tf.sequential({
      layers: [
        tf.layers.dense({
          inputShape: [5],
          units: 10,
          activation: 'relu',
        }),
        tf.layers.dense({
          units: 20,
          activation: 'sigmoid',
        }),
      ],
    });

    // Combine encoder and decoder
    this.model = tf.sequential({
      layers: [...encoder.layers, ...decoder.layers],
    });

    this.model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'meanSquaredError',
    });
  }

  // Detect performance anomalies
  public async detectAnomalies(metrics: PerformanceMetrics): Promise<AnomalyResult> {
    if (!this.model) {
      return { isAnomaly: false, confidence: 0 };
    }

    // Convert metrics to tensor
    const features = this.extractMetricFeatures(metrics);
    const input = tf.tensor2d([features], [1, 20]);

    // Get reconstruction
    const reconstruction = this.model.predict(input) as tf.Tensor;
    const reconstructionData = await reconstruction.data();

    // Calculate reconstruction error
    const error = this.calculateReconstructionError(features, Array.from(reconstructionData));

    // Clean up
    input.dispose();
    reconstruction.dispose();

    // Determine if anomaly
    const mean = this.getHistoricalMean('reconstruction_error');
    const stdDev = this.getHistoricalStdDev('reconstruction_error');
    const zScore = (error - mean) / stdDev;

    const isAnomaly = Math.abs(zScore) > this.anomalyThreshold;
    const confidence = Math.min(Math.abs(zScore) / 5, 1);

    // Record for history
    this.recordMetric('reconstruction_error', error);

    return {
      isAnomaly,
      confidence,
      error,
      zScore,
      metrics: this.identifyAnomalousMetrics(features, Array.from(reconstructionData)),
    };
  }

  // Extract features from performance metrics
  private extractMetricFeatures(metrics: PerformanceMetrics): number[] {
    return [
      metrics.responseTime / 1000,
      metrics.databaseTime / 100,
      metrics.cacheHitRate,
      metrics.errorRate,
      metrics.requestsPerSecond / 1000,
      metrics.cpuUsage,
      metrics.memoryUsage,
      metrics.diskUsage,
      metrics.networkLatency / 100,
      metrics.activeConnections / 1000,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // Padding to 20 features
    ];
  }

  // Calculate reconstruction error
  private calculateReconstructionError(original: number[], reconstructed: number[]): number {
    let error = 0;
    for (let i = 0; i < original.length; i++) {
      error += Math.pow(original[i] - reconstructed[i], 2);
    }
    return Math.sqrt(error / original.length);
  }

  // Identify which metrics are anomalous
  private identifyAnomalousMetrics(
    original: number[],
    reconstructed: number[]
  ): string[] {
    const metricNames = [
      'responseTime',
      'databaseTime',
      'cacheHitRate',
      'errorRate',
      'requestsPerSecond',
      'cpuUsage',
      'memoryUsage',
      'diskUsage',
      'networkLatency',
      'activeConnections',
    ];

    const anomalousMetrics: string[] = [];

    for (let i = 0; i < Math.min(original.length, metricNames.length); i++) {
      const diff = Math.abs(original[i] - reconstructed[i]);
      if (diff > 0.3) {
        // Threshold for individual metric
        anomalousMetrics.push(metricNames[i]);
      }
    }

    return anomalousMetrics;
  }

  // Record metric for historical analysis
  private recordMetric(name: string, value: number) {
    const history = this.metricsHistory.get(name) || [];
    history.push(value);

    // Keep last 1000 values
    if (history.length > 1000) {
      history.shift();
    }

    this.metricsHistory.set(name, history);
  }

  // Get historical mean
  private getHistoricalMean(metric: string): number {
    const history = this.metricsHistory.get(metric) || [];
    if (history.length === 0) return 0;
    return history.reduce((a, b) => a + b, 0) / history.length;
  }

  // Get historical standard deviation
  private getHistoricalStdDev(metric: string): number {
    const history = this.metricsHistory.get(metric) || [];
    if (history.length === 0) return 1;

    const mean = this.getHistoricalMean(metric);
    const variance =
      history.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / history.length;
    return Math.sqrt(variance);
  }

  // Start continuous monitoring
  private startMonitoring() {
    setInterval(() => {
      // This would connect to actual monitoring systems
      console.log('Anomaly detection running...');
    }, 60000); // Every minute
  }
}

// Interfaces
interface PerformanceMetrics {
  responseTime: number;
  databaseTime: number;
  cacheHitRate: number;
  errorRate: number;
  requestsPerSecond: number;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkLatency: number;
  activeConnections: number;
}

interface AnomalyResult {
  isAnomaly: boolean;
  confidence: number;
  error?: number;
  zScore?: number;
  metrics?: string[];
}

// Export instances
export const cachePredictor = new MLCachePredictor();
export const anomalyDetector = new PerformanceAnomalyDetector();