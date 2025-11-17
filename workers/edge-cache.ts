/**
 * Cloudflare Worker for Edge Caching
 * Provides global edge caching with 200+ locations
 * Smart cache rules, stale-while-revalidate, and geographic routing
 */

export interface Env {
  // KV namespace for cache metadata
  CACHE_METADATA: KVNamespace;

  // Environment variables
  ORIGIN_URL: string;
  CACHE_VERSION: string;

  // Durable Objects (optional)
  RATE_LIMITER?: DurableObjectNamespace;
}

// Cache configuration by route pattern
const CACHE_CONFIG = {
  '/api/planning': {
    edge: 3600,        // 1 hour at edge
    browser: 300,      // 5 minutes in browser
    tags: ['planning'],
    staleWhileRevalidate: 7200,
  },
  '/api/properties': {
    edge: 1800,        // 30 minutes at edge
    browser: 180,      // 3 minutes in browser
    tags: ['property'],
    staleWhileRevalidate: 3600,
  },
  '/api/areas': {
    edge: 86400,       // 24 hours at edge
    browser: 3600,     // 1 hour in browser
    tags: ['area'],
    staleWhileRevalidate: 172800,
  },
  '/api/search': {
    edge: 300,         // 5 minutes at edge
    browser: 60,       // 1 minute in browser
    tags: ['search'],
    staleWhileRevalidate: 600,
  },
  '/api/graphql': {
    edge: 600,         // 10 minutes at edge (queries only)
    browser: 120,      // 2 minutes in browser
    tags: ['graphql'],
    staleWhileRevalidate: 1200,
  },
  // Static assets
  '/_next/static': {
    edge: 31536000,    // 1 year at edge
    browser: 31536000, // 1 year in browser
    tags: ['static'],
    immutable: true,
  },
  '/images': {
    edge: 2592000,     // 30 days at edge
    browser: 86400,    // 1 day in browser
    tags: ['images'],
    staleWhileRevalidate: 5184000,
  },
};

// Default cache configuration
const DEFAULT_CACHE_CONFIG = {
  edge: 600,           // 10 minutes at edge
  browser: 60,         // 1 minute in browser
  tags: ['default'],
  staleWhileRevalidate: 1200,
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Performance timing
    const startTime = Date.now();

    // Get cache configuration for this route
    const cacheConfig = getCacheConfig(url.pathname);

    // Generate cache key
    const cacheKey = await generateCacheKey(request, env);

    // Check if request should bypass cache
    if (shouldBypassCache(request)) {
      return fetchFromOrigin(request, env, ctx, startTime);
    }

    // Try to get from cache
    const cache = caches.default;
    let cachedResponse = await cache.match(cacheKey);

    // Check if cached response is still fresh
    if (cachedResponse) {
      const age = getResponseAge(cachedResponse);
      const maxAge = cacheConfig.edge;
      const staleWhileRevalidate = cacheConfig.staleWhileRevalidate || 0;

      if (age < maxAge) {
        // Fresh cache hit
        return addPerformanceHeaders(cachedResponse.clone(), {
          hit: true,
          age,
          latency: Date.now() - startTime,
          location: env.CACHE_VERSION || 'edge',
        });
      } else if (age < maxAge + staleWhileRevalidate) {
        // Stale but within revalidation window
        ctx.waitUntil(
          revalidateCache(request, env, cache, cacheKey, cacheConfig)
        );

        return addPerformanceHeaders(cachedResponse.clone(), {
          hit: true,
          stale: true,
          age,
          latency: Date.now() - startTime,
          location: env.CACHE_VERSION || 'edge',
        });
      }
    }

    // Cache miss or expired - fetch from origin
    const originResponse = await fetchFromOrigin(request, env, ctx, startTime);

    // Cache the response if successful
    if (originResponse.status === 200 && request.method === 'GET') {
      const responseToCache = originResponse.clone();

      // Add cache headers
      const headers = new Headers(responseToCache.headers);
      headers.set('Cache-Control', getCacheControlHeader(cacheConfig));
      headers.set('CDN-Cache-Control', `max-age=${cacheConfig.edge}`);

      // Add cache tags for granular invalidation
      if (cacheConfig.tags) {
        headers.set('Cache-Tag', cacheConfig.tags.join(','));
      }

      const cachedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers,
      });

      // Store in cache
      ctx.waitUntil(cache.put(cacheKey, cachedResponse.clone()));

      // Store metadata in KV
      ctx.waitUntil(
        storeCacheMetadata(env.CACHE_METADATA, cacheKey, {
          url: request.url,
          timestamp: Date.now(),
          tags: cacheConfig.tags,
        })
      );
    }

    return addPerformanceHeaders(originResponse, {
      hit: false,
      latency: Date.now() - startTime,
      location: env.CACHE_VERSION || 'edge',
    });
  },
};

/**
 * Get cache configuration for a path
 */
function getCacheConfig(pathname: string) {
  for (const [pattern, config] of Object.entries(CACHE_CONFIG)) {
    if (pathname.startsWith(pattern)) {
      return config;
    }
  }
  return DEFAULT_CACHE_CONFIG;
}

/**
 * Generate cache key including user context
 */
async function generateCacheKey(request: Request, env: Env): Promise<Request> {
  const url = new URL(request.url);

  // Sort query parameters for consistent cache keys
  const sortedParams = new URLSearchParams([...url.searchParams.entries()].sort());
  url.search = sortedParams.toString();

  // Include important headers in cache key
  const headers = new Headers(request.headers);
  const cacheKeyHeaders = [];

  // Add authorization status (not the actual token)
  if (headers.get('authorization')) {
    cacheKeyHeaders.push('auth=true');
  }

  // Add accept-language for i18n
  const acceptLanguage = headers.get('accept-language');
  if (acceptLanguage) {
    const primaryLanguage = acceptLanguage.split(',')[0].split(';')[0];
    cacheKeyHeaders.push(`lang=${primaryLanguage}`);
  }

  // Add device type for responsive caching
  const userAgent = headers.get('user-agent') || '';
  const deviceType = getDeviceType(userAgent);
  cacheKeyHeaders.push(`device=${deviceType}`);

  // Add cache version for easy invalidation
  if (env.CACHE_VERSION) {
    cacheKeyHeaders.push(`v=${env.CACHE_VERSION}`);
  }

  // Construct final cache key URL
  if (cacheKeyHeaders.length > 0) {
    url.pathname = `${url.pathname}/${cacheKeyHeaders.join('/')}`;
  }

  return new Request(url.toString(), {
    method: request.method,
    headers: request.headers,
  });
}

/**
 * Check if request should bypass cache
 */
function shouldBypassCache(request: Request): boolean {
  // Don't cache non-GET requests
  if (request.method !== 'GET') {
    return true;
  }

  // Check cache-control headers
  const cacheControl = request.headers.get('cache-control');
  if (cacheControl) {
    if (cacheControl.includes('no-cache') || cacheControl.includes('no-store')) {
      return true;
    }
  }

  // Check pragma header
  if (request.headers.get('pragma') === 'no-cache') {
    return true;
  }

  return false;
}

/**
 * Fetch from origin with geographic routing
 */
async function fetchFromOrigin(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  startTime: number
): Promise<Response> {
  const originUrl = new URL(request.url);
  originUrl.hostname = new URL(env.ORIGIN_URL).hostname;

  // Add CF headers for origin
  const headers = new Headers(request.headers);
  headers.set('CF-Connecting-IP', request.headers.get('CF-Connecting-IP') || '');
  headers.set('CF-Ray', request.headers.get('CF-Ray') || '');
  headers.set('X-Forwarded-For', request.headers.get('X-Forwarded-For') || '');

  try {
    const response = await fetch(originUrl.toString(), {
      method: request.method,
      headers,
      body: request.method !== 'GET' ? request.body : undefined,
      cf: {
        // Cloudflare fetch options
        cacheTtl: 0, // Bypass Cloudflare's automatic caching
        cacheEverything: false,
        minify: {
          javascript: true,
          css: true,
          html: true,
        },
      },
    });

    // Add timing header
    const modifiedHeaders = new Headers(response.headers);
    modifiedHeaders.set('X-Origin-Latency', `${Date.now() - startTime}ms`);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: modifiedHeaders,
    });
  } catch (error) {
    // Return error response
    return new Response(JSON.stringify({ error: 'Origin fetch failed' }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'X-Error': error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}

/**
 * Get response age in seconds
 */
function getResponseAge(response: Response): number {
  const dateHeader = response.headers.get('date');
  if (!dateHeader) return Infinity;

  const responseTime = new Date(dateHeader).getTime();
  const now = Date.now();
  return Math.floor((now - responseTime) / 1000);
}

/**
 * Generate Cache-Control header
 */
function getCacheControlHeader(config: any): string {
  const directives = [];

  if (config.immutable) {
    directives.push('immutable');
  }

  directives.push(`max-age=${config.browser}`);
  directives.push('public');

  if (config.staleWhileRevalidate) {
    directives.push(`stale-while-revalidate=${config.staleWhileRevalidate}`);
  }

  return directives.join(', ');
}

/**
 * Add performance headers to response
 */
function addPerformanceHeaders(
  response: Response,
  metrics: {
    hit: boolean;
    stale?: boolean;
    age?: number;
    latency: number;
    location: string;
  }
): Response {
  const headers = new Headers(response.headers);

  headers.set('X-Cache', metrics.hit ? 'HIT' : 'MISS');
  if (metrics.stale) {
    headers.set('X-Cache-Status', 'STALE');
  }
  if (metrics.age !== undefined) {
    headers.set('Age', metrics.age.toString());
  }
  headers.set('X-Edge-Location', metrics.location);
  headers.set('X-Edge-Latency', `${metrics.latency}ms`);
  headers.set('Server-Timing', `edge;dur=${metrics.latency}`);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Revalidate cache in background
 */
async function revalidateCache(
  request: Request,
  env: Env,
  cache: Cache,
  cacheKey: Request,
  cacheConfig: any
): Promise<void> {
  try {
    const freshResponse = await fetchFromOrigin(request, env, {} as ExecutionContext, Date.now());

    if (freshResponse.status === 200) {
      const headers = new Headers(freshResponse.headers);
      headers.set('Cache-Control', getCacheControlHeader(cacheConfig));
      headers.set('CDN-Cache-Control', `max-age=${cacheConfig.edge}`);

      if (cacheConfig.tags) {
        headers.set('Cache-Tag', cacheConfig.tags.join(','));
      }

      const responseToCache = new Response(freshResponse.body, {
        status: freshResponse.status,
        statusText: freshResponse.statusText,
        headers,
      });

      await cache.put(cacheKey, responseToCache);
    }
  } catch (error) {
    console.error('Cache revalidation failed:', error);
  }
}

/**
 * Store cache metadata in KV
 */
async function storeCacheMetadata(
  kv: KVNamespace,
  cacheKey: Request,
  metadata: any
): Promise<void> {
  try {
    const key = new URL(cacheKey.url).pathname;
    await kv.put(key, JSON.stringify(metadata), {
      expirationTtl: 86400, // 24 hours
    });
  } catch (error) {
    console.error('Failed to store cache metadata:', error);
  }
}

/**
 * Detect device type from user agent
 */
function getDeviceType(userAgent: string): string {
  if (/mobile/i.test(userAgent)) return 'mobile';
  if (/tablet/i.test(userAgent)) return 'tablet';
  return 'desktop';
}