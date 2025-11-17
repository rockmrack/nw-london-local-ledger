/**
 * On-Demand Revalidation API
 * Allows manual and webhook-triggered revalidation of ISR pages
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { ISRConfig } from '@/lib/isr/config';

// Protect the endpoint with a secret token
const REVALIDATION_SECRET = process.env.REVALIDATION_SECRET || 'development-secret';

interface RevalidateRequest {
  secret?: string;
  type?: 'path' | 'tag' | 'batch';
  paths?: string[];
  tags?: string[];
  entity?: 'area' | 'property' | 'planning' | 'news' | 'all';
  slug?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: RevalidateRequest = await request.json();

    // Validate secret
    if (body.secret !== REVALIDATION_SECRET) {
      return NextResponse.json(
        { error: 'Invalid revalidation secret' },
        { status: 401 }
      );
    }

    const results: {
      revalidated: string[];
      errors: string[];
    } = {
      revalidated: [],
      errors: [],
    };

    // Handle different revalidation types
    switch (body.type) {
      case 'path':
        // Revalidate specific paths
        if (body.paths && Array.isArray(body.paths)) {
          for (const path of body.paths) {
            try {
              revalidatePath(path);
              results.revalidated.push(path);
            } catch (error) {
              results.errors.push(`Failed to revalidate path: ${path}`);
              console.error(`Revalidation error for ${path}:`, error);
            }
          }
        }
        break;

      case 'tag':
        // Revalidate by tags
        if (body.tags && Array.isArray(body.tags)) {
          for (const tag of body.tags) {
            try {
              revalidateTag(tag);
              results.revalidated.push(`tag:${tag}`);
            } catch (error) {
              results.errors.push(`Failed to revalidate tag: ${tag}`);
              console.error(`Revalidation error for tag ${tag}:`, error);
            }
          }
        }
        break;

      case 'batch':
        // Batch revalidation by entity type
        if (body.entity) {
          try {
            switch (body.entity) {
              case 'all':
                // Revalidate all content
                revalidateTag(ISRConfig.tags.all);
                results.revalidated.push('all-content');
                break;

              case 'area':
                revalidateTag(ISRConfig.tags.areas);
                if (body.slug) {
                  revalidateTag(`area-${body.slug}`);
                  revalidatePath(`/areas/${body.slug}`);
                  results.revalidated.push(`area:${body.slug}`);
                } else {
                  revalidatePath('/areas');
                  results.revalidated.push('all-areas');
                }
                break;

              case 'property':
                revalidateTag(ISRConfig.tags.properties);
                if (body.slug) {
                  revalidateTag(`property-${body.slug}`);
                  revalidatePath(`/property/${body.slug}`);
                  results.revalidated.push(`property:${body.slug}`);
                } else {
                  revalidatePath('/properties');
                  results.revalidated.push('all-properties');
                }
                break;

              case 'planning':
                revalidateTag(ISRConfig.tags.planning);
                if (body.slug) {
                  revalidateTag(`planning-${body.slug}`);
                  revalidatePath(`/planning/${body.slug}`);
                  results.revalidated.push(`planning:${body.slug}`);
                } else {
                  revalidatePath('/planning');
                  results.revalidated.push('all-planning');
                }
                break;

              case 'news':
                revalidateTag(ISRConfig.tags.news);
                if (body.slug) {
                  revalidateTag(`news-${body.slug}`);
                  revalidatePath(`/news/${body.slug}`);
                  results.revalidated.push(`news:${body.slug}`);
                } else {
                  revalidatePath('/news');
                  results.revalidated.push('all-news');
                }
                break;
            }
          } catch (error) {
            results.errors.push(`Failed to revalidate entity: ${body.entity}`);
            console.error(`Batch revalidation error for ${body.entity}:`, error);
          }
        }
        break;

      default:
        // Default: revalidate specific entity and slug
        if (body.entity && body.slug) {
          try {
            const path = `/${body.entity === 'property' ? 'property' : `${body.entity}s`}/${body.slug}`;
            revalidatePath(path);
            revalidateTag(`${body.entity}-${body.slug}`);
            results.revalidated.push(path);
          } catch (error) {
            results.errors.push(`Failed to revalidate: ${body.entity}/${body.slug}`);
            console.error('Revalidation error:', error);
          }
        }
    }

    return NextResponse.json({
      success: results.revalidated.length > 0,
      revalidated: results.revalidated,
      errors: results.errors,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Revalidation endpoint error:', error);
    return NextResponse.json(
      { error: 'Internal server error during revalidation' },
      { status: 500 }
    );
  }
}

// GET endpoint for health check
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'healthy',
    endpoint: '/api/revalidate',
    methods: ['POST'],
    requiredFields: ['secret', 'type'],
    supportedTypes: ['path', 'tag', 'batch'],
    supportedEntities: ['area', 'property', 'planning', 'news', 'all'],
  });
}