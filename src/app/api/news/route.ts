/**
 * News API Endpoint
 * Get published news articles with pagination
 */

import { NextRequest, NextResponse } from 'next/server';
import { newsService } from '@/services/news/NewsService';
import { getCache, setCache } from '@/lib/cache/redis';
import { validatePaginationParams } from '@/lib/utils/validation';

export async function GET(request: NextRequest) {
  try {
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
