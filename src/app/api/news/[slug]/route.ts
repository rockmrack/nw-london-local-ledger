/**
 * News Article Detail API Endpoint
 * Get a single article by slug
 */

import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    // Dynamic imports to prevent build-time analysis
    const { newsService } = await import('@/services/news/NewsService');
    const { getCache, setCache } = await import('@/lib/cache/redis');
    
    const { slug } = params;
    const cacheKey = `news:detail:${slug}`;

    // Try cache first
    const cached = await getCache<any>(cacheKey);
    if (cached) {
      // Increment view count asynchronously
      newsService.incrementViewCount(cached.article.id).catch(console.error);
      return NextResponse.json(cached);
    }

    // Get article
    const article = await newsService.getArticleBySlug(slug);

    if (!article) {
      return NextResponse.json(
        { error: 'Article not found' },
        { status: 404 }
      );
    }

    // Get tags
    const tags = await newsService.getArticleTags(article.id);

    const response = {
      article,
      tags,
    };

    // Cache for 1 hour
    await setCache(cacheKey, response, 3600);

    // Increment view count asynchronously
    newsService.incrementViewCount(article.id).catch(console.error);

    return NextResponse.json(response);
  } catch (error) {
    console.error('News detail API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch article' },
      { status: 500 }
    );
  }
}
