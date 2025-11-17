/**
 * Planning Applications API - Search endpoint
 * GET /api/planning
 */

import { NextRequest, NextResponse } from 'next/server';
import { planningService } from '@/services/planning/PlanningService';
import { validatePaginationParams } from '@/lib/utils/validation';
import { getCache, setCache } from '@/lib/cache/redis';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse query parameters
    const params = {
      council: searchParams.get('council') as any || undefined,
      status: searchParams.get('status') as any || undefined,
      developmentType: searchParams.get('developmentType') as any || undefined,
      areaId: searchParams.get('areaId') ? parseInt(searchParams.get('areaId')!) : undefined,
      postcode: searchParams.get('postcode') || undefined,
      reference: searchParams.get('reference') || undefined,
      fromDate: searchParams.get('fromDate') ? new Date(searchParams.get('fromDate')!) : undefined,
      toDate: searchParams.get('toDate') ? new Date(searchParams.get('toDate')!) : undefined,
      ...validatePaginationParams(
        searchParams.get('page'),
        searchParams.get('limit')
      ),
    };

    // Generate cache key
    const cacheKey = `planning:search:${JSON.stringify(params)}`;

    // Try to get from cache
    const cached = await getCache(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Search planning applications
    const result = await planningService.searchPlanningApplications(params);

    // Cache for 5 minutes
    await setCache(cacheKey, result, 300);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error searching planning applications:', error);
    return NextResponse.json(
      { error: 'Failed to search planning applications' },
      { status: 500 }
    );
  }
}
