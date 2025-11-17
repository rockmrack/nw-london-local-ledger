/**
 * API endpoint for error monitoring and analysis
 */

import { NextRequest, NextResponse } from 'next/server';
import { monitoringService } from '@/lib/monitoring/monitoring-service';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse time range
    const hours = parseInt(searchParams.get('hours') || '24');
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

    // Get error summary
    const errorSummary = await monitoringService.getErrorSummary({
      start: startTime,
      end: endTime
    });

    return NextResponse.json({
      success: true,
      timeRange: {
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        hours
      },
      summary: errorSummary,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Failed to retrieve error data:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve error data',
        details: (error as Error).message
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { error, context } = body;

    if (!error || !error.message) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid error data',
          required: ['error.message']
        },
        { status: 400 }
      );
    }

    // Create Error object from data
    const errorObj = new Error(error.message);
    errorObj.name = error.name || 'Error';
    errorObj.stack = error.stack || '';

    // Record the error
    monitoringService.recordError(errorObj, context);

    return NextResponse.json({
      success: true,
      message: 'Error recorded',
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Failed to record error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to record error',
        details: (error as Error).message
      },
      { status: 500 }
    );
  }
}