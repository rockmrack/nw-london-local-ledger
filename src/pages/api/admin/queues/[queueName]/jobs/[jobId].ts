/**
 * Job Details API Endpoint
 * GET /api/admin/queues/[queueName]/jobs/[jobId]
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { dashboardService } from '@/lib/queues/services/dashboard.service';
import { logger } from '@/lib/logging/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { queueName, jobId } = req.query;

  if (!queueName || !jobId || typeof queueName !== 'string' || typeof jobId !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Queue name and job ID are required',
    });
  }

  try {
    const jobDetails = await dashboardService.getJobDetails(queueName, jobId);

    if (!jobDetails.job) {
      return res.status(404).json({
        success: false,
        error: `Job ${jobId} not found in queue ${queueName}`,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: jobDetails.job.id,
        name: jobDetails.job.name,
        data: jobDetails.job.data,
        opts: jobDetails.job.opts,
        progress: jobDetails.progress,
        logs: jobDetails.logs,
        returnvalue: jobDetails.job.returnvalue,
        failedReason: jobDetails.job.failedReason,
        stacktrace: jobDetails.job.stacktrace,
        attemptsMade: jobDetails.job.attemptsMade,
        timestamp: jobDetails.job.timestamp,
        processedOn: jobDetails.job.processedOn,
        finishedOn: jobDetails.job.finishedOn,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error(`Error fetching job ${jobId} from queue ${queueName}:`, error);

    return res.status(500).json({
      success: false,
      error: 'Failed to fetch job details',
      message: error.message,
    });
  }
}