/**
 * Queue Management API Endpoint
 * POST /api/admin/queues/manage
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { dashboardService } from '@/lib/queues/services/dashboard.service';
import { queueService } from '@/lib/queues/services/queue.service';
import { logger } from '@/lib/logging/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, queueName, options } = req.body;

  if (!action || !queueName) {
    return res.status(400).json({
      success: false,
      error: 'Action and queueName are required',
    });
  }

  try {
    let result;

    switch (action) {
      case 'pause':
        await dashboardService.pauseQueue(queueName);
        result = { message: `Queue ${queueName} paused successfully` };
        break;

      case 'resume':
        await dashboardService.resumeQueue(queueName);
        result = { message: `Queue ${queueName} resumed successfully` };
        break;

      case 'clean':
        result = await dashboardService.cleanQueue(queueName, options || {});
        break;

      case 'retry-failed':
        result = await dashboardService.retryFailedJobs(queueName, options?.limit);
        break;

      case 'drain':
        await queueService.drainQueue(queueName);
        result = { message: `Queue ${queueName} drained successfully` };
        break;

      default:
        return res.status(400).json({
          success: false,
          error: `Unknown action: ${action}`,
        });
    }

    logger.info(`Queue management action: ${action} on ${queueName}`, { result, options });

    return res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error(`Error managing queue ${queueName}:`, error);

    return res.status(500).json({
      success: false,
      error: `Failed to ${action} queue ${queueName}`,
      message: error.message,
    });
  }
}