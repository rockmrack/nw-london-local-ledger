/**
 * Area Details API with comprehensive statistics
 * GET /api/areas/[slug]
 */

import { NextRequest, NextResponse } from 'next/server';
import { areaService } from '@/services/area/AreaService';
import { propertyService } from '@/services/property/PropertyService';
import { planningService } from '@/services/planning/PlanningService';
import { getCache, setCache } from '@/lib/cache/redis';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;

    // Generate cache key
    const cacheKey = `area:${slug}`;

    // Try to get from cache
    const cached = await getCache(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Get area
    const area = await areaService.getAreaBySlug(slug);

    if (!area) {
      return NextResponse.json(
        { error: 'Area not found' },
        { status: 404 }
      );
    }

    // Get comprehensive stats and related data
    const [
      stats,
      recentProperties,
      recentPlanning,
      schools,
      streets,
    ] = await Promise.all([
      areaService.getAreaStats(area.id),
      propertyService.getPropertiesByArea(area.id, 10),
      planningService.getPlanningByArea(area.id, 10),
      areaService.getSchoolsByArea(area.id),
      areaService.getStreetsByArea(area.id),
    ]);

    const response = {
      area,
      stats,
      recentProperties,
      recentPlanning,
      schools,
      streets,
    };

    // Cache for 1 hour
    await setCache(cacheKey, response, 3600);

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching area:', error);
    return NextResponse.json(
      { error: 'Failed to fetch area details' },
      { status: 500 }
    );
  }
}
