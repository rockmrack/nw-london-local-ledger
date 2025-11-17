/**
 * Cache Invalidation API
 * POST /api/cache/invalidate - Invalidate cache entries
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMultiLayerCache } from '@/lib/cache/multi-layer-cache';
import { CacheInvalidation } from '@/lib/cache/cache-tags';

export async function POST(request: NextRequest) {
  try {
    const cache = getMultiLayerCache();
    const body = await request.json();

    // Validate request
    if (!body.method) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Invalid request: method is required',
        },
        { status: 400 }
      );
    }

    let deleted = 0;
    let message = '';

    switch (body.method) {
      case 'tag':
        // Invalidate by single tag
        if (!body.tag) {
          throw new Error('Tag is required for tag invalidation');
        }
        deleted = await cache.deleteByTag(body.tag);
        message = `Invalidated ${deleted} entries with tag: ${body.tag}`;
        break;

      case 'tags':
        // Invalidate by multiple tags
        if (!body.tags || !Array.isArray(body.tags)) {
          throw new Error('Tags array is required for tags invalidation');
        }
        for (const tag of body.tags) {
          deleted += await cache.deleteByTag(tag);
        }
        message = `Invalidated ${deleted} entries with tags: ${body.tags.join(', ')}`;
        break;

      case 'pattern':
        // Invalidate by pattern
        if (!body.pattern) {
          throw new Error('Pattern is required for pattern invalidation');
        }
        deleted = await cache.deleteByPattern(body.pattern);
        message = `Invalidated ${deleted} entries matching pattern: ${body.pattern}`;
        break;

      case 'key':
        // Invalidate specific key
        if (!body.key) {
          throw new Error('Key is required for key invalidation');
        }
        await cache.delete(body.key);
        deleted = 1;
        message = `Invalidated key: ${body.key}`;
        break;

      case 'keys':
        // Invalidate multiple keys
        if (!body.keys || !Array.isArray(body.keys)) {
          throw new Error('Keys array is required for keys invalidation');
        }
        for (const key of body.keys) {
          await cache.delete(key);
          deleted++;
        }
        message = `Invalidated ${deleted} keys`;
        break;

      case 'smart':
        // Smart invalidation based on entity type
        if (!body.entityType || !body.entityData) {
          throw new Error('EntityType and entityData required for smart invalidation');
        }
        deleted = await CacheInvalidation.smartInvalidate(
          body.entityType,
          body.entityData,
          cache
        );
        message = `Smart invalidation completed: ${deleted} entries`;
        break;

      case 'area':
        // Invalidate all caches for an area
        if (!body.area) {
          throw new Error('Area is required for area invalidation');
        }
        deleted = await CacheInvalidation.invalidatePropertyArea(body.area, cache);
        message = `Invalidated ${deleted} entries for area: ${body.area}`;
        break;

      case 'postcode':
        // Invalidate all caches for a postcode
        if (!body.postcode) {
          throw new Error('Postcode is required for postcode invalidation');
        }
        deleted = await CacheInvalidation.invalidatePostcode(body.postcode, cache);
        message = `Invalidated ${deleted} entries for postcode: ${body.postcode}`;
        break;

      case 'council':
        // Invalidate planning caches for a council
        if (!body.council) {
          throw new Error('Council is required for council invalidation');
        }
        deleted = await CacheInvalidation.invalidatePlanningCouncil(body.council, cache);
        message = `Invalidated ${deleted} planning entries for council: ${body.council}`;
        break;

      case 'hourly':
        // Invalidate hourly time-based caches
        deleted = await CacheInvalidation.invalidateHourly(cache);
        message = `Invalidated ${deleted} hourly cache entries`;
        break;

      case 'user':
        // Invalidate user-specific caches
        if (!body.userId) {
          throw new Error('UserId is required for user cache invalidation');
        }
        deleted = await CacheInvalidation.invalidateUserCache(body.userId, cache);
        message = `Invalidated ${deleted} entries for user: ${body.userId}`;
        break;

      case 'clear':
        // Clear all caches (dangerous - only in development)
        if (process.env.NODE_ENV === 'production') {
          throw new Error('Clear all is not allowed in production');
        }
        await cache.clear();
        message = 'All caches cleared (development only)';
        break;

      default:
        throw new Error(`Unknown invalidation method: ${body.method}`);
    }

    return NextResponse.json({
      status: 'success',
      deleted,
      message,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cache invalidation error:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to invalidate cache',
      },
      { status: 500 }
    );
  }
}

// Also support DELETE method
export async function DELETE(request: NextRequest) {
  return POST(request);
}