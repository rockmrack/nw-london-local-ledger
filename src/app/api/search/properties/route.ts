/**
 * Advanced Property Search API
 * GET /api/search/properties
 */

import { NextRequest, NextResponse } from 'next/server';
import { searchProperties } from '@/lib/search/advanced-search';
import type { SearchFilters, SearchOptions } from '@/lib/search/advanced-search';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse query
    const query = searchParams.get('q') || '';

    // Parse filters
    const filters: SearchFilters = {
      areas: searchParams.get('areas')?.split(','),
      postcodes: searchParams.get('postcodes')?.split(','),
      propertyType: searchParams.get('propertyType')?.split(','),
      minPrice: searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined,
      maxPrice: searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined,
      minBedrooms: searchParams.get('minBedrooms') ? Number(searchParams.get('minBedrooms')) : undefined,
      maxBedrooms: searchParams.get('maxBedrooms') ? Number(searchParams.get('maxBedrooms')) : undefined,
      minBathrooms: searchParams.get('minBathrooms') ? Number(searchParams.get('minBathrooms')) : undefined,
      epcRating: searchParams.get('epcRating')?.split(','),
      hasGarden: searchParams.get('hasGarden') === 'true',
      hasParking: searchParams.get('hasParking') === 'true',
      newBuild: searchParams.get('newBuild') === 'true',
      tenure: searchParams.get('tenure')?.split(','),
      radiusKm: searchParams.get('radiusKm') ? Number(searchParams.get('radiusKm')) : undefined,
      centerLat: searchParams.get('centerLat') ? Number(searchParams.get('centerLat')) : undefined,
      centerLng: searchParams.get('centerLng') ? Number(searchParams.get('centerLng')) : undefined,
    };

    // Parse options
    const options: SearchOptions = {
      query,
      filters,
      sort: (searchParams.get('sort') as any) || 'relevance',
      page: Number(searchParams.get('page') || '1'),
      limit: Number(searchParams.get('limit') || '20'),
      includeAggregations: searchParams.get('aggregations') === 'true',
    };

    const results = await searchProperties(options);

    return NextResponse.json(results);
  } catch (error) {
    console.error('Property search error:', error);
    return NextResponse.json(
      { error: 'Search failed', message: (error as Error).message },
      { status: 500 }
    );
  }
}
