/**
 * ML Edge Inference Worker
 * Runs TensorFlow.js Lite models on Cloudflare Workers for ultra-low latency
 */

import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-wasm';

export interface EdgePredictionRequest {
  type: 'page' | 'cache' | 'warming';
  sessionId: string;
  features?: number[];
  context?: {
    userId?: string;
    council?: string;
    currentPath?: string;
    timestamp?: number;
  };
}

export interface EdgePredictionResponse {
  predictions: any[];
  latency: number;
  cached: boolean;
  workerId: string;
}

// Model weights stored in KV or R2
interface ModelData {
  weights: ArrayBuffer;
  metadata: {
    version: string;
    inputShape: number[];
    outputShape: number[];
  };
}

class EdgeInferenceWorker {
  private models = new Map<string, tf.LayersModel>();
  private modelCache = new Map<string, ModelData>();
  private predictionCache = new Map<string, any>();
  private readonly workerId = crypto.randomUUID();

  constructor(private env: any) {
    // Initialize TensorFlow.js with WebAssembly backend for Workers
    this.initializeTF();
  }

  /**
   * Initialize TensorFlow.js for edge environment
   */
  private async initializeTF() {
    // Set WASM backend for Cloudflare Workers
    await tf.setBackend('wasm');
    await tf.ready();

    console.log('TensorFlow.js initialized with WASM backend');
  }

  /**
   * Handle incoming requests
   */
  async handleRequest(request: Request): Promise<Response> {
    const startTime = Date.now();

    try {
      // Parse request
      const predictionRequest = await request.json() as EdgePredictionRequest;

      // Check cache first
      const cacheKey = this.getCacheKey(predictionRequest);
      const cached = this.predictionCache.get(cacheKey);

      if (cached) {
        return new Response(JSON.stringify({
          ...cached,
          cached: true,
          latency: Date.now() - startTime,
          workerId: this.workerId,
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Load model if not cached
      const model = await this.loadModel(predictionRequest.type);

      // Run inference
      const predictions = await this.predict(model, predictionRequest);

      // Cache result
      const response: EdgePredictionResponse = {
        predictions,
        latency: Date.now() - startTime,
        cached: false,
        workerId: this.workerId,
      };

      this.predictionCache.set(cacheKey, response);

      // Return response
      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json' },
      });

    } catch (error) {
      console.error('Edge inference error:', error);
      return new Response(JSON.stringify({
        error: error.message,
        workerId: this.workerId,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  /**
   * Load model from KV or R2 storage
   */
  private async loadModel(modelType: string): Promise<tf.LayersModel> {
    // Check if model is already loaded
    if (this.models.has(modelType)) {
      return this.models.get(modelType)!;
    }

    // Fetch model from KV storage
    const modelKey = `model:${modelType}:latest`;
    const modelData = await this.env.MODELS.get(modelKey, 'arrayBuffer');

    if (!modelData) {
      // Fall back to lightweight default model
      return this.createDefaultModel(modelType);
    }

    // Load model from weights
    const model = await this.loadModelFromWeights(modelData);
    this.models.set(modelType, model);

    return model;
  }

  /**
   * Create lightweight default model
   */
  private createDefaultModel(modelType: string): tf.LayersModel {
    switch (modelType) {
      case 'page':
        return this.createPagePredictorModel();
      case 'cache':
        return this.createCacheOptimizerModel();
      case 'warming':
        return this.createWarmingModel();
      default:
        throw new Error(`Unknown model type: ${modelType}`);
    }
  }

  /**
   * Create lightweight page predictor model
   */
  private createPagePredictorModel(): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        tf.layers.dense({
          inputShape: [50],
          units: 32,
          activation: 'relu',
        }),
        tf.layers.dense({
          units: 16,
          activation: 'relu',
        }),
        tf.layers.dense({
          units: 100, // Number of possible pages
          activation: 'softmax',
        }),
      ],
    });

    model.compile({
      optimizer: 'adam',
      loss: 'categoricalCrossentropy',
    });

    return model;
  }

  /**
   * Create lightweight cache optimizer model
   */
  private createCacheOptimizerModel(): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        tf.layers.dense({
          inputShape: [30],
          units: 16,
          activation: 'relu',
        }),
        tf.layers.dense({
          units: 8,
          activation: 'relu',
        }),
        tf.layers.dense({
          units: 4, // [shouldCache, priority, warming, invalidation]
          activation: 'sigmoid',
        }),
      ],
    });

    model.compile({
      optimizer: 'adam',
      loss: 'binaryCrossentropy',
    });

    return model;
  }

  /**
   * Create cache warming model
   */
  private createWarmingModel(): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        tf.layers.dense({
          inputShape: [20],
          units: 16,
          activation: 'relu',
        }),
        tf.layers.dense({
          units: 10, // Top 10 resources to warm
          activation: 'sigmoid',
        }),
      ],
    });

    model.compile({
      optimizer: 'adam',
      loss: 'binaryCrossentropy',
    });

    return model;
  }

  /**
   * Load model from weights buffer
   */
  private async loadModelFromWeights(weights: ArrayBuffer): Promise<tf.LayersModel> {
    // Convert ArrayBuffer to model
    // In production, this would deserialize the model properly
    // For now, return a default model
    return this.createDefaultModel('page');
  }

  /**
   * Run prediction
   */
  private async predict(
    model: tf.LayersModel,
    request: EdgePredictionRequest
  ): Promise<any[]> {
    // Prepare features
    const features = request.features || this.extractFeatures(request);
    const inputTensor = tf.tensor2d([features]);

    // Run inference
    const output = model.predict(inputTensor) as tf.Tensor;
    const predictions = await output.array();

    // Clean up tensors
    inputTensor.dispose();
    output.dispose();

    // Process predictions based on type
    return this.processPredictions(request.type, predictions[0]);
  }

  /**
   * Extract features from request context
   */
  private extractFeatures(request: EdgePredictionRequest): number[] {
    const features: number[] = [];

    // Time features
    const now = new Date();
    features.push(
      now.getHours() / 23,
      now.getDay() / 6,
      now.getMonth() / 11
    );

    // Context features
    if (request.context) {
      // Council encoding
      const councils = ['barnet', 'brent', 'camden', 'ealing', 'hackney'];
      const councilIdx = councils.indexOf(request.context.council || '');
      features.push(councilIdx >= 0 ? councilIdx / councils.length : 0);

      // Path encoding
      const pathTypes = ['property', 'council', 'search', 'statistics'];
      for (const pathType of pathTypes) {
        features.push(request.context.currentPath?.includes(pathType) ? 1 : 0);
      }
    }

    // Pad features to expected size
    while (features.length < 50) {
      features.push(0);
    }

    return features.slice(0, 50);
  }

  /**
   * Process raw predictions into structured response
   */
  private processPredictions(type: string, predictions: any): any[] {
    switch (type) {
      case 'page':
        return this.processPagePredictions(predictions);
      case 'cache':
        return this.processCachePredictions(predictions);
      case 'warming':
        return this.processWarmingPredictions(predictions);
      default:
        return predictions;
    }
  }

  /**
   * Process page predictions
   */
  private processPagePredictions(predictions: number[]): any[] {
    const pages = [
      '/properties/search',
      '/properties/[id]',
      '/councils/[council]',
      '/statistics',
      '/compare',
    ];

    // Get top 5 predictions
    const indexed = predictions.map((prob, idx) => ({ prob, idx }));
    indexed.sort((a, b) => b.prob - a.prob);

    return indexed.slice(0, 5).map(({ prob, idx }) => ({
      page: pages[idx % pages.length],
      probability: prob,
      preload: prob > 0.7,
    }));
  }

  /**
   * Process cache predictions
   */
  private processCachePredictions(predictions: number[]): any[] {
    const [shouldCache, priority, warming, invalidation] = predictions;

    return [{
      shouldCache: shouldCache > 0.5,
      priority: priority,
      warmingScore: warming,
      invalidationProbability: invalidation,
      ttl: Math.floor(3600 * (1 + priority * 23)), // 1 hour to 1 day
    }];
  }

  /**
   * Process warming predictions
   */
  private processWarmingPredictions(predictions: number[]): any[] {
    const resources = [
      '/api/properties/featured',
      '/api/councils/stats',
      '/api/search/recent',
      '/api/properties/trending',
      '/api/statistics/overview',
    ];

    return predictions.map((score, idx) => ({
      resource: resources[idx % resources.length],
      warmingScore: score,
      shouldWarm: score > 0.6,
    })).filter(r => r.shouldWarm);
  }

  /**
   * Generate cache key
   */
  private getCacheKey(request: EdgePredictionRequest): string {
    return `${request.type}:${request.sessionId}:${JSON.stringify(request.context || {})}`;
  }

  /**
   * Batch prediction endpoint
   */
  async handleBatchRequest(request: Request): Promise<Response> {
    try {
      const requests = await request.json() as EdgePredictionRequest[];
      const responses: EdgePredictionResponse[] = [];

      // Process in parallel with concurrency limit
      const batchSize = 10;
      for (let i = 0; i < requests.length; i += batchSize) {
        const batch = requests.slice(i, i + batchSize);
        const batchResponses = await Promise.all(
          batch.map(req => this.processSingleRequest(req))
        );
        responses.push(...batchResponses);
      }

      return new Response(JSON.stringify(responses), {
        headers: { 'Content-Type': 'application/json' },
      });

    } catch (error) {
      console.error('Batch processing error:', error);
      return new Response(JSON.stringify({
        error: error.message,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  /**
   * Process single prediction request
   */
  private async processSingleRequest(
    request: EdgePredictionRequest
  ): Promise<EdgePredictionResponse> {
    const startTime = Date.now();

    try {
      const model = await this.loadModel(request.type);
      const predictions = await this.predict(model, request);

      return {
        predictions,
        latency: Date.now() - startTime,
        cached: false,
        workerId: this.workerId,
      };
    } catch (error) {
      console.error('Single request error:', error);
      return {
        predictions: [],
        latency: Date.now() - startTime,
        cached: false,
        workerId: this.workerId,
      };
    }
  }

  /**
   * Proactive cache warming based on predictions
   */
  async warmCache(): Promise<void> {
    console.log('Starting proactive cache warming...');

    // Get warming predictions
    const warmingRequest: EdgePredictionRequest = {
      type: 'warming',
      sessionId: 'system',
      context: {
        timestamp: Date.now(),
      },
    };

    const model = await this.loadModel('warming');
    const predictions = await this.predict(model, warmingRequest);

    // Warm predicted resources
    for (const prediction of predictions) {
      if (prediction.shouldWarm) {
        await this.warmResource(prediction.resource);
      }
    }

    console.log(`Warmed ${predictions.length} resources`);
  }

  /**
   * Warm individual resource
   */
  private async warmResource(resource: string): Promise<void> {
    try {
      // Store in cache with predicted TTL
      const ttl = 3600; // 1 hour default
      await this.env.CACHE.put(resource, 'warmed', {
        expirationTtl: ttl,
      });
    } catch (error) {
      console.error(`Failed to warm resource ${resource}:`, error);
    }
  }

  /**
   * Get worker metrics
   */
  getMetrics(): any {
    return {
      workerId: this.workerId,
      modelsLoaded: this.models.size,
      cacheSize: this.predictionCache.size,
      tensorMemory: tf.memory(),
    };
  }
}

// Cloudflare Worker entry point
export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const worker = new EdgeInferenceWorker(env);

    // Route based on path
    const url = new URL(request.url);

    switch (url.pathname) {
      case '/predict':
        return worker.handleRequest(request);
      case '/batch':
        return worker.handleBatchRequest(request);
      case '/warm':
        await worker.warmCache();
        return new Response('Cache warming initiated', { status: 200 });
      case '/metrics':
        return new Response(JSON.stringify(worker.getMetrics()), {
          headers: { 'Content-Type': 'application/json' },
        });
      default:
        return new Response('Edge Inference Worker', { status: 200 });
    }
  },

  // Scheduled handler for periodic cache warming
  async scheduled(event: any, env: any, ctx: any): Promise<void> {
    const worker = new EdgeInferenceWorker(env);
    await worker.warmCache();
  },
};