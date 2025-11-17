/**
 * API endpoint for managing performance alerts
 */

import { NextRequest, NextResponse } from 'next/server';
import { AlertManager } from '@/lib/monitoring/alert-manager';
import { monitoringService } from '@/lib/monitoring/monitoring-service';

// Access alert manager through monitoring service
const alertManager = (monitoringService as any).alertManager as AlertManager;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '100');
    const active = searchParams.get('active') === 'true';

    let alerts;

    if (active) {
      // Get only active alerts
      alerts = alertManager.getActiveAlerts();
    } else if (type) {
      // Get alerts by type
      alerts = alertManager.getAlertsByType(type as any, limit);
    } else {
      // Get all alert history
      alerts = alertManager.getAlertHistory(limit);
    }

    // Get alert statistics
    const statistics = alertManager.getAlertStatistics();

    return NextResponse.json({
      success: true,
      alerts,
      statistics,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Failed to retrieve alerts:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve alerts',
        details: (error as Error).message
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, alertId } = body;

    if (action === 'resolve' && alertId) {
      // Resolve an alert
      alertManager.resolveAlert(alertId);

      return NextResponse.json({
        success: true,
        message: 'Alert resolved',
        alertId
      });
    }

    if (action === 'clear') {
      // Clear all alerts
      alertManager.clearAlerts();

      return NextResponse.json({
        success: true,
        message: 'All alerts cleared'
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Invalid action',
        validActions: ['resolve', 'clear']
      },
      { status: 400 }
    );

  } catch (error) {
    console.error('Failed to process alert action:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process alert action',
        details: (error as Error).message
      },
      { status: 500 }
    );
  }
}