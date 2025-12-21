/**
 * ML Prediction API Endpoint
 * Provides real-time predictions for cache optimization
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Lazy load ML modules to prevent TensorFlow import during build
async function getMLModules() {
  const [pcm, ie] = await Promise.all([
    import('@/lib/ml/predictive-cache-manager'),
    import('@/lib/ml/inference/inference-engine'),
  ]);
  return {
    predictiveCacheManager: pcm.predictiveCacheManager,
    inferenceEngine: ie.inferenceEngine
  };
}

// Request validation schema
const PredictionRequestSchema = z.object({
  sessionId: z.string(),
  type: z.enum(['page', 'cache', 'warming']),
  context: z.object({
    currentPath: z.string().optional(),
    userId: z.string().optional(),
    council: z.string().optional(),
    propertyType: z.string().optional(),
    priceRange: z.string().optional(),
    sessionData: z.any().optional(),
  }).optional(),
  options: z.object({
    topK: z.number().min(1).max(20).optional(),
    threshold: z.number().min(0).max(1).optional(),
    useEdgeInference: z.boolean().optional(),
  }).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request
    const body = await request.json();
    const validatedRequest = PredictionRequestSchema.parse(body);

    const startTime = Date.now();

    // Get ML modules
    const { predictiveCacheManager, inferenceEngine } = await getMLModules();

    // Get predictions based on edge inference preference
    let predictions;

    if (validatedRequest.options?.useEdgeInference) {
      // Use edge inference for ultra-low latency
      predictions = await predictiveCacheManager.edgePredict(
        validatedRequest.sessionId,
        validatedRequest.context
      );
    } else {
      // Use local inference
      predictions = await inferenceEngine.predict({
        type: validatedRequest.type,
        context: validatedRequest.context,
        options: {
          topK: validatedRequest.options?.topK,
          threshold: validatedRequest.options?.threshold,
        },
      });
    }

    // Track prediction for accuracy monitoring
    await trackPrediction(validatedRequest.sessionId, predictions);

    return NextResponse.json({
      success: true,
      sessionId: validatedRequest.sessionId,
      predictions: predictions.predictions,
      confidence: predictions.confidence,
      latency: Date.now() - startTime,
      cached: predictions.cached,
      modelVersion: predictions.modelVersion,
    });

  } catch (error) {
    console.error('Prediction API error:', error);

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
        error: 'Prediction failed',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      );
    }

    // Get cached predictions for session
    const predictions = await getCachedPredictions(sessionId);

    return NextResponse.json({
      success: true,
      sessionId,
      predictions,
      timestamp: Date.now(),
    });

  } catch (error) {
    console.error('GET predictions error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve predictions' },
      { status: 500 }
    );
  }
}

/**
 * Track prediction for accuracy monitoring
 */
async function trackPrediction(sessionId: string, predictions: any): Promise<void> {
  try {
    // Store prediction for later validation
    const redis = (await import('@/lib/cache/redis')).default;

    await redis.setCache(
      `prediction:${sessionId}:${Date.now()}`,
      {
        predictions: predictions.predictions,
        timestamp: Date.now(),
      },
      300 // 5 minute TTL
    );
  } catch (error) {
    console.error('Failed to track prediction:', error);
  }
}

/**
 * Get cached predictions for session
 */
async function getCachedPredictions(sessionId: string): Promise<any[]> {
  try {
    const redis = (await import('@/lib/cache/redis')).default;

    // Get recent predictions for session
    const pattern = `prediction:${sessionId}:*`;
    const keys = await redis.scanKeys(pattern);

    const predictions: any[] = [];
    for (const key of keys.slice(0, 10)) { // Limit to 10 most recent
      const data = await redis.getCache(key);
      if (data) {
        predictions.push(data);
      }
    }

    return predictions.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('Failed to get cached predictions:', error);
    return [];
  }
}