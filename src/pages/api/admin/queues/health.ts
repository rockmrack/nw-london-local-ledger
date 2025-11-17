/**
 * Queue Health Check API Endpoint
 * GET /api/admin/queues/health
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { healthCheck } from '@/lib/queues/workers';
import { logger } from '@/lib/logging/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const health = await healthCheck();

    const statusCode = health.healthy ? 200 : 503;

    return res.status(statusCode).json({
      success: health.healthy,
      data: health,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error checking queue health:', error);

    return res.status(503).json({
      success: false,
      error: 'Health check failed',
      message: error.message,
      data: {
        healthy: false,
        workers: {
          scraper: false,
          indexer: false,
          cacheWarmer: false,
          cleanup: false,
        },
        queues: [],
        errors: [error.message],
      },
    });
  }
}