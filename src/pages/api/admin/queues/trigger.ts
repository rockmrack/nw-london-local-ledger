/**
 * Queue Job Trigger API Endpoint
 * POST /api/admin/queues/trigger
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { dashboardService } from '@/lib/queues/services/dashboard.service';
import { logger } from '@/lib/logging/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, options } = req.body;

  if (!type) {
    return res.status(400).json({
      success: false,
      error: 'Job type is required',
    });
  }

  try {
    let result;

    switch (type) {
      case 'scraping':
        result = await dashboardService.triggerScraping(options || {});
        break;

      case 'indexing':
        result = await dashboardService.triggerIndexing(options || {
          type: 'planning',
          operation: 'reindex',
        });
        break;

      case 'cache-warming':
        result = await dashboardService.triggerCacheWarming(options || {
          type: 'popular',
        });
        break;

      case 'cleanup':
        result = await dashboardService.triggerCleanup(options || {
          task: 'refresh-views',
        });
        break;

      default:
        return res.status(400).json({
          success: false,
          error: `Unknown job type: ${type}`,
        });
    }

    logger.info(`Triggered ${type} job`, { result, options });

    return res.status(200).json({
      success: true,
      data: result,
      message: `${type} job triggered successfully`,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error(`Error triggering ${type} job:`, error);

    return res.status(500).json({
      success: false,
      error: `Failed to trigger ${type} job`,
      message: error.message,
    });
  }
}