/**
 * Queue Metrics Export API Endpoint
 * GET /api/admin/queues/metrics
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

  const { format = 'json' } = req.query;

  try {
    const metrics = await dashboardService.exportMetrics();

    if (format === 'prometheus') {
      // Return Prometheus format metrics
      res.setHeader('Content-Type', 'text/plain; version=0.0.4');
      return res.status(200).send(metrics.prometheus);
    } else {
      // Return JSON format metrics
      return res.status(200).json({
        success: true,
        data: metrics.json,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error: any) {
    logger.error('Error exporting queue metrics:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to export metrics',
      message: error.message,
    });
  }
}