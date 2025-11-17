/**
 * Properties API - Search endpoint
 * GET /api/properties
 */

import { NextRequest, NextResponse } from 'next/server';
import { propertyService } from '@/services/property/PropertyService';
import { validatePaginationParams } from '@/lib/utils/validation';
import { getCache, setCache } from '@/lib/cache/redis';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse query parameters
    const params = {
      postcode: searchParams.get('postcode') || undefined,
      areaId: searchParams.get('areaId') ? parseInt(searchParams.get('areaId')!) : undefined,
      propertyType: searchParams.get('propertyType') as any || undefined,
      minPrice: searchParams.get('minPrice') ? parseFloat(searchParams.get('minPrice')!) : undefined,
      maxPrice: searchParams.get('maxPrice') ? parseFloat(searchParams.get('maxPrice')!) : undefined,
      minBedrooms: searchParams.get('minBedrooms') ? parseInt(searchParams.get('minBedrooms')!) : undefined,
      maxBedrooms: searchParams.get('maxBedrooms') ? parseInt(searchParams.get('maxBedrooms')!) : undefined,
      sortBy: (searchParams.get('sortBy') as 'price' | 'date' | 'bedrooms') || 'date',
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
      ...validatePaginationParams(
        searchParams.get('page'),
        searchParams.get('limit')
      ),
    };

    // Generate cache key
    const cacheKey = `properties:search:${JSON.stringify(params)}`;

    // Try to get from cache
    const cached = await getCache(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Search properties
    const result = await propertyService.searchProperties(params);

    // Cache for 5 minutes
    await setCache(cacheKey, result, 300);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error searching properties:', error);
    return NextResponse.json(
      { error: 'Failed to search properties' },
      { status: 500 }
    );
  }
}
