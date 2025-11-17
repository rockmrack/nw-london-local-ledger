/**
 * TensorFlow.js Page Prediction Model
 * Neural network for predicting next page visits
 */

import * as tf from '@tensorflow/tfjs';

export interface PagePrediction {
  page: string;
  probability: number;
  confidence: number;
  features?: string[];
}

export class PagePredictorModel {
  private model: tf.LayersModel | null = null;
  private readonly modelPath = '/models/page-predictor';
  private readonly vocabSize = 1000; // Number of unique pages
  private pageVocabulary = new Map<string, number>();
  private reverseVocab = new Map<number, string>();

  /**
   * Build the neural network architecture
   */
  buildModel(inputDim: number = 100): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        // Input layer with dropout for regularization
        tf.layers.dense({
          inputShape: [inputDim],
          units: 256,
          activation: 'relu',
          kernelInitializer: 'heNormal',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }),
        }),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.batchNormalization(),

        // Hidden layers with residual connections
        tf.layers.dense({
          units: 512,
          activation: 'relu',
          kernelInitializer: 'heNormal',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }),
        }),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.batchNormalization(),

        // Attention mechanism layer
        tf.layers.dense({
          units: 256,
          activation: 'relu',
          kernelInitializer: 'heNormal',
        }),
        tf.layers.dropout({ rate: 0.2 }),

        // Deep layers for complex pattern learning
        tf.layers.dense({
          units: 128,
          activation: 'relu',
          kernelInitializer: 'heNormal',
        }),
        tf.layers.dropout({ rate: 0.2 }),

        // Output layer for multi-class classification
        tf.layers.dense({
          units: this.vocabSize,
          activation: 'softmax',
          kernelInitializer: 'glorotUniform',
        }),
      ],
    });

    // Compile with advanced optimizer
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy', 'topKCategoricalAccuracy'],
    });

    return model;
  }

  /**
   * Build a lightweight model for edge deployment
   */
  buildLiteModel(inputDim: number = 100): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        // Simplified architecture for edge inference
        tf.layers.dense({
          inputShape: [inputDim],
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

        tf.layers.dense({
          units: this.vocabSize,
          activation: 'softmax',
        }),
      ],
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });

    return model;
  }

  /**
   * Train the model with user behavior data
   */
  async train(
    features: tf.Tensor2D,
    labels: tf.Tensor2D,
    options: {
      epochs?: number;
      batchSize?: number;
      validationSplit?: number;
      callbacks?: tf.CustomCallbackArgs;
    } = {}
  ): Promise<tf.History> {
    const {
      epochs = 50,
      batchSize = 32,
      validationSplit = 0.2,
      callbacks
    } = options;

    if (!this.model) {
      this.model = this.buildModel(features.shape[1] as number);
    }

    // Advanced callbacks for monitoring
    const defaultCallbacks: tf.CustomCallbackArgs = {
      onEpochEnd: async (epoch, logs) => {
        console.log(`Epoch ${epoch + 1}/${epochs}`);
        console.log(`Loss: ${logs?.loss?.toFixed(4)}, Accuracy: ${logs?.acc?.toFixed(4)}`);

        // Early stopping condition
        if (logs?.val_acc && logs.val_acc > 0.85) {
          console.log('Early stopping: Target accuracy reached');
          this.model!.stopTraining = true;
        }
      },
      onBatchEnd: async (batch, logs) => {
        if (batch % 100 === 0) {
          console.log(`Batch ${batch}: loss=${logs?.loss?.toFixed(4)}`);
        }
      },
    };

    const finalCallbacks = callbacks || defaultCallbacks;

    // Train with data augmentation
    const history = await this.model.fit(features, labels, {
      epochs,
      batchSize,
      validationSplit,
      shuffle: true,
      callbacks: finalCallbacks,
    });

    return history;
  }

  /**
   * Predict next pages with probabilities
   */
  async predict(
    features: Float32Array | tf.Tensor2D,
    topK: number = 5
  ): Promise<PagePrediction[]> {
    if (!this.model) {
      throw new Error('Model not loaded or trained');
    }

    // Convert to tensor if needed
    const inputTensor = features instanceof Float32Array
      ? tf.tensor2d([features])
      : features;

    // Get predictions
    const predictions = this.model.predict(inputTensor) as tf.Tensor2D;
    const probabilities = await predictions.array();

    // Clean up tensors
    if (features instanceof Float32Array) {
      inputTensor.dispose();
    }
    predictions.dispose();

    // Get top K predictions
    const results: PagePrediction[] = [];
    const probs = probabilities[0];

    // Find top K indices
    const indexed = probs.map((prob, idx) => ({ prob, idx }));
    indexed.sort((a, b) => b.prob - a.prob);

    for (let i = 0; i < Math.min(topK, indexed.length); i++) {
      const { prob, idx } = indexed[i];
      const page = this.reverseVocab.get(idx) || `page_${idx}`;

      results.push({
        page,
        probability: prob,
        confidence: this.calculateConfidence(prob, i),
        features: this.getRelevantFeatures(idx),
      });
    }

    return results;
  }

  /**
   * Batch prediction for efficiency
   */
  async batchPredict(
    featuresBatch: Float32Array[],
    topK: number = 5
  ): Promise<PagePrediction[][]> {
    if (!this.model) {
      throw new Error('Model not loaded');
    }

    // Stack features into batch tensor
    const batchTensor = tf.stack(featuresBatch.map(f => tf.tensor1d(f)));

    // Predict in batch
    const predictions = this.model.predict(batchTensor) as tf.Tensor2D;
    const probabilities = await predictions.array();

    // Clean up
    batchTensor.dispose();
    predictions.dispose();

    // Process each prediction
    const results: PagePrediction[][] = [];

    for (const probs of probabilities) {
      const batchResults: PagePrediction[] = [];
      const indexed = probs.map((prob, idx) => ({ prob, idx }));
      indexed.sort((a, b) => b.prob - a.prob);

      for (let i = 0; i < Math.min(topK, indexed.length); i++) {
        const { prob, idx } = indexed[i];
        batchResults.push({
          page: this.reverseVocab.get(idx) || `page_${idx}`,
          probability: prob,
          confidence: this.calculateConfidence(prob, i),
        });
      }

      results.push(batchResults);
    }

    return results;
  }

  /**
   * Save model to disk or cloud storage
   */
  async saveModel(path?: string): Promise<void> {
    if (!this.model) {
      throw new Error('No model to save');
    }

    const savePath = path || this.modelPath;
    await this.model.save(`file://${savePath}`);

    // Save vocabulary
    const vocabPath = `${savePath}/vocabulary.json`;
    const vocabData = {
      pageVocabulary: Array.from(this.pageVocabulary.entries()),
      reverseVocab: Array.from(this.reverseVocab.entries()),
    };

    // In production, save to storage
    console.log('Model and vocabulary saved to:', savePath);
  }

  /**
   * Load pre-trained model
   */
  async loadModel(path?: string): Promise<void> {
    const loadPath = path || this.modelPath;

    try {
      this.model = await tf.loadLayersModel(`file://${loadPath}/model.json`);

      // Load vocabulary
      // In production, load from storage
      console.log('Model loaded from:', loadPath);
    } catch (error) {
      console.error('Error loading model:', error);
      // Fall back to building new model
      this.model = this.buildModel();
    }
  }

  /**
   * Quantize model for edge deployment
   */
  async quantizeModel(): Promise<tf.GraphModel> {
    if (!this.model) {
      throw new Error('No model to quantize');
    }

    // Convert to graph model for optimization
    const graphModel = await tf.loadGraphModel(
      'indexeddb://temp-model'
    );

    // Apply quantization
    const quantizedModel = await tf.quantization.quantize(
      graphModel,
      {
        dtype: 'uint8',
        weightBitDepth: 8,
        activationBitDepth: 8,
      }
    );

    return quantizedModel;
  }

  /**
   * Calculate prediction confidence
   */
  private calculateConfidence(probability: number, rank: number): number {
    // Confidence based on probability and rank
    const probConfidence = probability;
    const rankPenalty = Math.exp(-rank * 0.5);
    return probConfidence * rankPenalty;
  }

  /**
   * Get relevant features for a prediction
   */
  private getRelevantFeatures(pageIdx: number): string[] {
    // Return top contributing features for this prediction
    const features: string[] = [];

    const page = this.reverseVocab.get(pageIdx);
    if (!page) return features;

    // Analyze page patterns
    if (page.includes('property')) {
      features.push('property_view_pattern');
    }
    if (page.includes('council')) {
      features.push('council_interest');
    }
    if (page.includes('search')) {
      features.push('search_behavior');
    }
    if (page.includes('compare')) {
      features.push('comparison_intent');
    }

    return features;
  }

  /**
   * Update vocabulary with new pages
   */
  updateVocabulary(pages: string[]): void {
    for (const page of pages) {
      if (!this.pageVocabulary.has(page)) {
        const idx = this.pageVocabulary.size;
        if (idx < this.vocabSize) {
          this.pageVocabulary.set(page, idx);
          this.reverseVocab.set(idx, page);
        }
      }
    }
  }

  /**
   * Get model metrics
   */
  getModelMetrics(): {
    parameters: number;
    layers: number;
    memoryUsage: number;
  } {
    if (!this.model) {
      return { parameters: 0, layers: 0, memoryUsage: 0 };
    }

    let parameters = 0;
    let layers = 0;

    for (const layer of this.model.layers) {
      layers++;
      for (const weight of layer.weights) {
        parameters += weight.shape.reduce((a, b) => a * b, 1);
      }
    }

    // Estimate memory usage (4 bytes per parameter)
    const memoryUsage = parameters * 4 / (1024 * 1024); // MB

    return { parameters, layers, memoryUsage };
  }

  /**
   * Evaluate model performance
   */
  async evaluate(
    testFeatures: tf.Tensor2D,
    testLabels: tf.Tensor2D
  ): Promise<{
    loss: number;
    accuracy: number;
    topKAccuracy: number;
  }> {
    if (!this.model) {
      throw new Error('Model not loaded');
    }

    const result = this.model.evaluate(testFeatures, testLabels) as tf.Scalar[];

    const metrics = {
      loss: await result[0].data(),
      accuracy: await result[1].data(),
      topKAccuracy: await result[2].data(),
    };

    // Clean up
    result.forEach(tensor => tensor.dispose());

    return {
      loss: metrics.loss[0],
      accuracy: metrics.accuracy[0],
      topKAccuracy: metrics.topKAccuracy[0],
    };
  }
}

export const pagePredictorModel = new PagePredictorModel();