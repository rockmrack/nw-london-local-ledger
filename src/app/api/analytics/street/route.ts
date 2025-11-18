import { NextRequest, NextResponse } from 'next/server';
import { StreetAnalyticsService } from '@/services/analytics/StreetAnalyticsService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const street = searchParams.get('street');
    const postcode = searchParams.get('postcode');

    if (!street || !postcode) {
      return NextResponse.json({
        success: false,
        error: 'Street and postcode are required'
      }, { status: 400 });
    }

    const analyticsService = new StreetAnalyticsService({} as any, {} as any);
    const insights = await analyticsService.getStreetInsights(street, postcode);

    return NextResponse.json({
      success: true,
      data: insights
    });

  } catch (error) {
    console.error('Street analytics error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch street analytics'
    }, { status: 500 });
  }
}
