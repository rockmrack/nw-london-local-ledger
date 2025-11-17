/**
 * Areas API - List all areas
 * GET /api/areas
 */

import { NextResponse } from 'next/server';
import { areaService } from '@/services/area/AreaService';
import { getCache, setCache } from '@/lib/cache/redis';

export async function GET() {
  try {
    const cacheKey = 'areas:all';

    // Try to get from cache
    const cached = await getCache(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Get all areas
    const areas = await areaService.getAllAreas();

    // Cache for 1 day (areas don't change often)
    await setCache(cacheKey, areas, 86400);

    return NextResponse.json(areas);
  } catch (error) {
    console.error('Error fetching areas:', error);
    return NextResponse.json(
      { error: 'Failed to fetch areas' },
      { status: 500 }
    );
  }
}
