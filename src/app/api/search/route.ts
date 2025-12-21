/**
 * Search API Endpoint
 * Global search across all entities
 */

import { NextRequest, NextResponse } from 'next/server';
import { searchService } from '@/lib/search/elasticsearch';
import { validatePaginationParams } from '@/lib/utils/validation';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query parameter "q" is required' },
        { status: 400 }
      );
    }

    const { page, limit } = validatePaginationParams(
      searchParams.get('page'),
      searchParams.get('limit')
    );

    const offset = (page - 1) * limit;

    // Perform search
    const results = await searchService.search(query, { limit, offset });

    return NextResponse.json({
      query,
      results: results.results,
      total: results.total,
      page,
      limit,
      totalPages: Math.ceil(results.total / limit),
      took: results.took,
    });
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    );
  }
}
