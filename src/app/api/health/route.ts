/**
 * Health check API endpoint
 * Returns the status of the application and its dependencies
 */

import { NextResponse } from 'next/server';
import { testConnection } from '@/lib/db/client';

export async function GET() {
  try {
    const dbHealthy = await testConnection();

    const health = {
      status: dbHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: dbHealthy ? 'up' : 'down',
        // Add more service checks as needed
      },
    };

    return NextResponse.json(health, {
      status: dbHealthy ? 200 : 503,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Failed to check system health',
      },
      { status: 500 }
    );
  }
}
