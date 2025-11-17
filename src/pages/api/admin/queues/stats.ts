/**
 * Queue Statistics API Endpoint
 * GET /api/admin/queues/stats
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

  try {
    // Get queue statistics
    const stats = await dashboardService.getStats();

    return res.status(200).json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error fetching queue stats:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to fetch queue statistics',
      message: error.message,
    });
  }
}