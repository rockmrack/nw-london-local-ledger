/**
 * Property Details API
 * GET /api/properties/[slug]
 */

import { NextRequest, NextResponse } from 'next/server';
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
    const cacheKey = `property:${slug}`;

    // Try to get from cache
    const cached = await getCache(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Get property with sales history
    const propertyId = parseInt(slug.split('-')[0]);
    const property = await propertyService.getPropertyWithSales(propertyId);

    if (!property) {
      return NextResponse.json(
        { error: 'Property not found' },
        { status: 404 }
      );
    }

    // Get related data
    const [similarProperties, planningApplications, nearbyProperties] = await Promise.all([
      propertyService.getSimilarProperties(property.id, 5),
      property.id ? planningService.getPlanningByProperty(property.id) : [],
      property.latitude && property.longitude
        ? propertyService.getNearbyProperties(property.latitude, property.longitude, 500, 10)
        : [],
    ]);

    const response = {
      property,
      similarProperties,
      planningApplications,
      nearbyProperties,
    };

    // Cache for 1 hour
    await setCache(cacheKey, response, 3600);

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching property:', error);
    return NextResponse.json(
      { error: 'Failed to fetch property details' },
      { status: 500 }
    );
  }
}
