/**
 * News API Endpoint
 * Get published news articles with pagination
 */

import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    // Dynamic imports to avoid build-time evaluation
    const { newsService } = await import('@/services/news/NewsService');
    const { getCache, setCache } = await import('@/lib/cache/redis');
    const { validatePaginationParams } = await import('@/lib/utils/validation');

    const searchParams = request.nextUrl.searchParams;
    const { page, limit } = validatePaginationParams(
      searchParams.get('page'),
      searchParams.get('limit')
    );
    const type = searchParams.get('type');

    const cacheKey = `news:list:${page}:${limit}:${type || 'all'}`;

    // Try cache first
    const cached = await getCache<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Get articles
    let data;
    if (type) {
      const articles = await newsService.getArticlesByType(type, limit);
      data = {
        articles,
        total: articles.length,
        page: 1,
        limit,
        totalPages: 1,
      };
    } else {
      data = await newsService.getPublishedArticles(page, limit);
    }

    // Cache for 5 minutes
    await setCache(cacheKey, data, 300);

    return NextResponse.json(data);
  } catch (error) {
    console.error('News API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch news articles' },
      { status: 500 }
    );
  }
}
