/**
 * Cloudflare Worker for Cache Invalidation
 * Provides granular cache purging via tags and patterns
 */

export interface Env {
  CACHE_METADATA: KVNamespace;
  PURGE_TOKEN: string;
  ORIGIN_URL: string;
  CLOUDFLARE_ZONE_ID: string;
  CLOUDFLARE_API_TOKEN: string;
}

interface PurgeRequest {
  tags?: string[];
  urls?: string[];
  prefixes?: string[];
  everything?: boolean;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Only allow POST requests
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Verify authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader || authHeader !== `Bearer ${env.PURGE_TOKEN}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    try {
      const purgeRequest: PurgeRequest = await request.json();
      const results = await processPurgeRequest(purgeRequest, env);

      return new Response(JSON.stringify({
        success: true,
        results,
        timestamp: new Date().toISOString(),
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
  },
};

/**
 * Process purge request
 */
async function processPurgeRequest(
  request: PurgeRequest,
  env: Env
): Promise<any> {
  const results = {
    purgedCount: 0,
    purgedUrls: [] as string[],
    purgedTags: [] as string[],
    errors: [] as string[],
  };

  // Purge everything (use with caution)
  if (request.everything) {
    try {
      await purgeEverything(env);
      results.purgedCount = -1; // Indicates all cache purged
      return results;
    } catch (error) {
      results.errors.push(`Failed to purge all: ${error}`);
      throw error;
    }
  }

  // Purge by cache tags
  if (request.tags && request.tags.length > 0) {
    for (const tag of request.tags) {
      try {
        const purged = await purgeCacheTag(tag, env);
        results.purgedTags.push(tag);
        results.purgedCount += purged;
      } catch (error) {
        results.errors.push(`Failed to purge tag ${tag}: ${error}`);
      }
    }
  }

  // Purge specific URLs
  if (request.urls && request.urls.length > 0) {
    for (const url of request.urls) {
      try {
        await purgeUrl(url, env);
        results.purgedUrls.push(url);
        results.purgedCount++;
      } catch (error) {
        results.errors.push(`Failed to purge URL ${url}: ${error}`);
      }
    }
  }

  // Purge by prefix
  if (request.prefixes && request.prefixes.length > 0) {
    for (const prefix of request.prefixes) {
      try {
        const purged = await purgeByPrefix(prefix, env);
        results.purgedCount += purged;
      } catch (error) {
        results.errors.push(`Failed to purge prefix ${prefix}: ${error}`);
      }
    }
  }

  return results;
}

/**
 * Purge entire cache
 */
async function purgeEverything(env: Env): Promise<void> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${env.CLOUDFLARE_ZONE_ID}/purge_cache`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ purge_everything: true }),
    }
  );

  if (!response.ok) {
    throw new Error(`Cloudflare API error: ${response.statusText}`);
  }
}

/**
 * Purge cache by tag
 */
async function purgeCacheTag(tag: string, env: Env): Promise<number> {
  // Use Cloudflare API to purge by cache tag
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${env.CLOUDFLARE_ZONE_ID}/purge_cache`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tags: [tag],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to purge tag ${tag}: ${response.statusText}`);
  }

  // Also clear from KV metadata
  const keys = await env.CACHE_METADATA.list({ prefix: tag });
  const deletePromises = keys.keys.map(key => env.CACHE_METADATA.delete(key.name));
  await Promise.all(deletePromises);

  return keys.keys.length;
}

/**
 * Purge specific URL
 */
async function purgeUrl(url: string, env: Env): Promise<void> {
  // Normalize URL
  const normalizedUrl = new URL(url, env.ORIGIN_URL).toString();

  // Use Cloudflare API to purge specific URL
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${env.CLOUDFLARE_ZONE_ID}/purge_cache`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: [normalizedUrl],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to purge URL ${url}: ${response.statusText}`);
  }

  // Also clear from local cache
  const cache = caches.default;
  await cache.delete(normalizedUrl);

  // Clear from KV metadata
  const key = new URL(normalizedUrl).pathname;
  await env.CACHE_METADATA.delete(key);
}

/**
 * Purge by URL prefix
 */
async function purgeByPrefix(prefix: string, env: Env): Promise<number> {
  // Get all keys matching prefix from KV
  const keys = await env.CACHE_METADATA.list({ prefix });

  if (keys.keys.length === 0) {
    return 0;
  }

  // Construct full URLs
  const urls = keys.keys.map(key => {
    return new URL(key.name, env.ORIGIN_URL).toString();
  });

  // Batch purge URLs (Cloudflare allows up to 30 URLs per request)
  const batchSize = 30;
  let totalPurged = 0;

  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${env.CLOUDFLARE_ZONE_ID}/purge_cache`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: batch,
        }),
      }
    );

    if (response.ok) {
      totalPurged += batch.length;
    }
  }

  // Clear from KV metadata
  const deletePromises = keys.keys.map(key => env.CACHE_METADATA.delete(key.name));
  await Promise.all(deletePromises);

  return totalPurged;
}

/**
 * Scheduled cache cleanup (cron trigger)
 */
export async function scheduled(
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  // Clean up expired metadata
  const keys = await env.CACHE_METADATA.list();
  const now = Date.now();

  for (const key of keys.keys) {
    const metadata = await env.CACHE_METADATA.get(key.name, 'json') as any;

    if (metadata && metadata.timestamp) {
      // Remove metadata older than 7 days
      if (now - metadata.timestamp > 7 * 24 * 60 * 60 * 1000) {
        await env.CACHE_METADATA.delete(key.name);
      }
    }
  }
}