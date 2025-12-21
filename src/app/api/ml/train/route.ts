/**
 * ML Model Training API Endpoint
 * Triggers model training and retraining
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Lazy load ML modules to prevent TensorFlow import during build
async function getTrainingPipeline() {
  const { trainingPipeline } = await import('@/lib/ml');
  return trainingPipeline;
}

// Request validation schema
const TrainingRequestSchema = z.object({
  modelType: z.enum(['page-predictor', 'cache-optimizer', 'all']),
  config: z.object({
    epochs: z.number().min(1).max(100).optional(),
    batchSize: z.number().min(1).max(128).optional(),
    learningRate: z.number().min(0.0001).max(0.1).optional(),
    validationSplit: z.number().min(0.1).max(0.5).optional(),
    targetAccuracy: z.number().min(0.5).max(1.0).optional(),
  }).optional(),
  schedule: z.enum(['once', 'daily', 'weekly', 'monthly']).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Verify authorization
    const authHeader = request.headers.get('authorization');
    if (!isAuthorized(authHeader)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse and validate request
    const body = await request.json();
    const validatedRequest = TrainingRequestSchema.parse(body);

    console.log('Starting model training:', validatedRequest);

    // Get training pipeline instance
    const trainingPipeline = await getTrainingPipeline();

    // Start training based on schedule
    if (validatedRequest.schedule && validatedRequest.schedule !== 'once') {
      // Schedule recurring training
      await trainingPipeline.scheduleRetraining(validatedRequest.schedule);

      return NextResponse.json({
        success: true,
        message: `Training scheduled: ${validatedRequest.schedule}`,
        modelType: validatedRequest.modelType,
      });
    }

    // Run one-time training
    const trainingResult = await trainingPipeline.runTrainingPipeline(
      validatedRequest.modelType,
      validatedRequest.config
    );

    return NextResponse.json({
      success: trainingResult.success,
      metrics: trainingResult.metrics,
      modelPath: trainingResult.modelPath,
      timestamp: Date.now(),
    });

  } catch (error) {
    console.error('Training API error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request',
          details: error.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Training failed',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Verify authorization
    const authHeader = request.headers.get('authorization');
    if (!isAuthorized(authHeader)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get training status and history
    const status = await getTrainingStatus();

    return NextResponse.json({
      success: true,
      status,
      timestamp: Date.now(),
    });

  } catch (error) {
    console.error('GET training status error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve training status' },
      { status: 500 }
    );
  }
}

/**
 * Check authorization for training operations
 */
function isAuthorized(authHeader: string | null): boolean {
  if (!authHeader) return false;

  // In production, implement proper authentication
  const expectedToken = process.env.ML_TRAINING_API_KEY || 'development-key';
  const providedToken = authHeader.replace('Bearer ', '');

  return providedToken === expectedToken;
}

/**
 * Get training status and history
 */
async function getTrainingStatus(): Promise<any> {
  try {
    // In production, fetch from training logs/database
    return {
      lastTraining: {
        timestamp: Date.now() - 24 * 60 * 60 * 1000, // 1 day ago
        modelType: 'all',
        metrics: {
          pagePredictor: {
            accuracy: 0.87,
            loss: 0.23,
          },
          cacheOptimizer: {
            accuracy: 0.91,
            ttlMAE: 120,
          },
        },
      },
      nextTraining: {
        timestamp: Date.now() + 6 * 24 * 60 * 60 * 1000, // In 6 days
        schedule: 'weekly',
      },
      currentModels: {
        pagePredictor: {
          version: 'v1.2.0',
          deployedAt: Date.now() - 24 * 60 * 60 * 1000,
          performance: {
            accuracy: 0.86,
            latencyMs: 8,
          },
        },
        cacheOptimizer: {
          version: 'v1.1.0',
          deployedAt: Date.now() - 24 * 60 * 60 * 1000,
          performance: {
            accuracy: 0.90,
            latencyMs: 5,
          },
        },
      },
    };
  } catch (error) {
    console.error('Failed to get training status:', error);
    return {
      error: 'Failed to retrieve status',
    };
  }
}