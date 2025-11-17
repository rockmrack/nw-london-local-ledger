/**
 * Planning Application Details API
 * GET /api/planning/[slug]
 */

import { NextRequest, NextResponse } from 'next/server';
import { planningService } from '@/services/planning/PlanningService';
import { propertyService } from '@/services/property/PropertyService';
import { getCache, setCache } from '@/lib/cache/redis';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;

    // Generate cache key
    const cacheKey = `planning:${slug}`;

    // Try to get from cache
    const cached = await getCache(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Get planning application
    const application = await planningService.getPlanningBySlug(slug);

    if (!application) {
      return NextResponse.json(
        { error: 'Planning application not found' },
        { status: 404 }
      );
    }

    // Get related data
    const [documents, comments, nearbyApplications, relatedProperty] = await Promise.all([
      planningService.getDocuments(application.id),
      planningService.getComments(application.id),
      application.latitude && application.longitude
        ? planningService.getNearbyApplications(application.latitude, application.longitude, 500, 10)
        : [],
      application.propertyId
        ? propertyService.getPropertyById(application.propertyId)
        : null,
    ]);

    const response = {
      application,
      documents,
      comments,
      nearbyApplications,
      relatedProperty,
    };

    // Cache for 1 hour
    await setCache(cacheKey, response, 3600);

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching planning application:', error);
    return NextResponse.json(
      { error: 'Failed to fetch planning application details' },
      { status: 500 }
    );
  }
}
