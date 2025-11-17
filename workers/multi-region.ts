/**
 * Multi-Region Edge Worker for Cloudflare Workers
 * Implements GeoDNS routing, regional failover, and edge caching
 */

export interface Env {
  // KV namespaces for caching
  CACHE: KVNamespace;
  METRICS: KVNamespace;

  // Environment variables
  PRIMARY_ORIGIN: string;
  REGIONAL_ORIGINS: string;
}

// Regional endpoints configuration
const REGIONS = {
  'eu-west-2': { // London (Primary)
    origin: 'https://london.nwlondonledger.com',
    priority: 1,
    healthy: true,
  },
  'eu-central-1': { // Frankfurt
    origin: 'https://frankfurt.nwlondonledger.com',
    priority: 2,
    healthy: true,
  },
  'eu-west-1': { // Dublin
    origin: 'https://dublin.nwlondonledger.com',
    priority: 3,
    healthy: true,
  },
  'eu-west-3': { // Amsterdam via Paris region
    origin: 'https://amsterdam.nwlondonledger.com',
    priority: 4,
    healthy: true,
  },
};

// Cache configuration
const CACHE_CONFIG = {
  api: {
    ttl: 60, // 1 minute for API responses
    staleWhileRevalidate: 120,
  },
  static: {
    ttl: 31536000, // 1 year for static assets
    staleWhileRevalidate: 86400,
  },
  html: {
    ttl: 300, // 5 minutes for HTML pages
    staleWhileRevalidate: 600,
  },
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Add performance timing
    const startTime = Date.now();

    try {
      // Determine client region
      const clientRegion = getClientRegion(request);

      // Get optimal origin based on region and health
      const origin = await getOptimalOrigin(clientRegion, env);

      // Handle different request types
      let response: Response;

      if (url.pathname.startsWith('/api/')) {
        response = await handleApiRequest(request, origin, env, ctx);
      } else if (isStaticAsset(url.pathname)) {
        response = await handleStaticRequest(request, origin, env, ctx);
      } else {
        response = await handleHtmlRequest(request, origin, env, ctx);
      }

      // Add performance headers
      response = addPerformanceHeaders(response, startTime, origin);

      // Track metrics
      ctx.waitUntil(trackMetrics(request, response, startTime, env));

      return response;
    } catch (error) {
      console.error('Worker error:', error);
      return handleError(error as Error, request);
    }
  },
};

/**
 * Determine client region from CF headers
 */
function getClientRegion(request: Request): string {
  const cf = (request as any).cf;

  if (!cf) return 'eu-west-2'; // Default to London

  // Map country codes to regions
  const countryToRegion: Record<string, string> = {
    'GB': 'eu-west-2', // UK -> London
    'IE': 'eu-west-1', // Ireland -> Dublin
    'DE': 'eu-central-1', // Germany -> Frankfurt
    'NL': 'eu-west-3', // Netherlands -> Amsterdam
    'BE': 'eu-west-3', // Belgium -> Amsterdam
    'FR': 'eu-west-3', // France -> Amsterdam
    'CH': 'eu-central-1', // Switzerland -> Frankfurt
    'AT': 'eu-central-1', // Austria -> Frankfurt
  };

  return countryToRegion[cf.country] || 'eu-west-2';
}

/**
 * Get optimal origin based on region and health status
 */
async function getOptimalOrigin(clientRegion: string, env: Env): Promise<string> {
  // Check if preferred region is healthy
  const preferredRegion = REGIONS[clientRegion as keyof typeof REGIONS];
  if (preferredRegion?.healthy) {
    return preferredRegion.origin;
  }

  // Fallback to healthy region with lowest priority
  const healthyRegions = Object.values(REGIONS)
    .filter(r => r.healthy)
    .sort((a, b) => a.priority - b.priority);

  if (healthyRegions.length > 0) {
    return healthyRegions[0].origin;
  }

  // Last resort: use primary origin from env
  return env.PRIMARY_ORIGIN || 'https://nwlondonledger.com';
}

/**
 * Handle API requests with caching and failover
 */
async function handleApiRequest(
  request: Request,
  origin: string,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const cacheKey = new Request(request.url, request);
  const cache = caches.default;

  // Check cache first
  let response = await cache.match(cacheKey);

  if (response) {
    // Return cached response and revalidate in background
    ctx.waitUntil(revalidateCache(request, origin, cache, cacheKey));
    return response;
  }

  // Fetch from origin with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    response = await fetch(new Request(origin + new URL(request.url).pathname + new URL(request.url).search, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    }));

    clearTimeout(timeoutId);

    if (response.ok) {
      // Cache successful responses
      const cacheResponse = new Response(response.body, response);
      cacheResponse.headers.set('Cache-Control', `public, max-age=${CACHE_CONFIG.api.ttl}, stale-while-revalidate=${CACHE_CONFIG.api.staleWhileRevalidate}`);
      cacheResponse.headers.set('X-Cache', 'MISS');
      cacheResponse.headers.set('X-Origin', origin);

      ctx.waitUntil(cache.put(cacheKey, cacheResponse.clone()));

      return cacheResponse;
    }
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('Origin fetch failed:', error);
  }

  // Try fallback origins
  for (const region of Object.values(REGIONS)) {
    if (region.origin !== origin && region.healthy) {
      try {
        response = await fetch(new Request(region.origin + new URL(request.url).pathname + new URL(request.url).search, {
          method: request.method,
          headers: request.headers,
          body: request.body,
        }));

        if (response.ok) {
          response.headers.set('X-Fallback-Origin', region.origin);
          return response;
        }
      } catch {
        // Continue to next region
      }
    }
  }

  return new Response('Service Unavailable', { status: 503 });
}

/**
 * Handle static asset requests with long-term caching
 */
async function handleStaticRequest(
  request: Request,
  origin: string,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const cache = caches.default;
  const cacheKey = new Request(request.url, request);

  // Check cache
  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    cachedResponse.headers.set('X-Cache', 'HIT');
    return cachedResponse;
  }

  // Fetch from origin
  const response = await fetch(new Request(origin + new URL(request.url).pathname, request));

  if (response.ok) {
    const cacheResponse = new Response(response.body, response);
    cacheResponse.headers.set('Cache-Control', `public, max-age=${CACHE_CONFIG.static.ttl}, immutable`);
    cacheResponse.headers.set('X-Cache', 'MISS');

    ctx.waitUntil(cache.put(cacheKey, cacheResponse.clone()));

    return cacheResponse;
  }

  return response;
}

/**
 * Handle HTML page requests with smart caching
 */
async function handleHtmlRequest(
  request: Request,
  origin: string,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  // Add support for HTTP/3 and Early Hints
  const headers = new Headers(request.headers);
  headers.set('Alt-Svc', 'h3=":443"; ma=86400');
  headers.set('Accept-CH', 'Sec-CH-UA-Platform-Version, Sec-CH-UA-Full-Version');

  const modifiedRequest = new Request(origin + new URL(request.url).pathname + new URL(request.url).search, {
    method: request.method,
    headers: headers,
    body: request.body,
  });

  const response = await fetch(modifiedRequest);

  if (response.ok) {
    // Add performance optimizations
    const optimizedResponse = new Response(response.body, response);
    optimizedResponse.headers.set('X-Origin-Region', origin);
    optimizedResponse.headers.set('Cache-Control', `public, max-age=${CACHE_CONFIG.html.ttl}, stale-while-revalidate=${CACHE_CONFIG.html.staleWhileRevalidate}`);

    // Add Link headers for resource hints
    optimizedResponse.headers.append('Link', '</_next/static/css/app.css>; rel=preload; as=style');
    optimizedResponse.headers.append('Link', '</_next/static/chunks/framework.js>; rel=modulepreload');
    optimizedResponse.headers.append('Link', '</fonts/inter-var.woff2>; rel=preload; as=font; crossorigin');

    return optimizedResponse;
  }

  return response;
}

/**
 * Background cache revalidation
 */
async function revalidateCache(
  request: Request,
  origin: string,
  cache: Cache,
  cacheKey: Request
): Promise<void> {
  try {
    const freshResponse = await fetch(new Request(origin + new URL(request.url).pathname + new URL(request.url).search, request));

    if (freshResponse.ok) {
      await cache.put(cacheKey, freshResponse);
    }
  } catch (error) {
    console.error('Cache revalidation failed:', error);
  }
}

/**
 * Check if path is a static asset
 */
function isStaticAsset(pathname: string): boolean {
  const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot'];
  return staticExtensions.some(ext => pathname.endsWith(ext)) || pathname.startsWith('/_next/static/');
}

/**
 * Add performance tracking headers
 */
function addPerformanceHeaders(response: Response, startTime: number, origin: string): Response {
  const duration = Date.now() - startTime;

  response.headers.set('X-Edge-Duration', `${duration}ms`);
  response.headers.set('X-Edge-Origin', origin);
  response.headers.set('Server-Timing', `edge;dur=${duration}`);

  // Add QUIC support headers
  response.headers.set('Alt-Svc', 'h3=":443"; ma=86400, h3-29=":443"; ma=86400');

  return response;
}

/**
 * Track performance metrics
 */
async function trackMetrics(
  request: Request,
  response: Response,
  startTime: number,
  env: Env
): Promise<void> {
  const duration = Date.now() - startTime;
  const url = new URL(request.url);

  const metrics = {
    timestamp: Date.now(),
    duration,
    status: response.status,
    path: url.pathname,
    method: request.method,
    cacheStatus: response.headers.get('X-Cache') || 'BYPASS',
    origin: response.headers.get('X-Origin-Region') || 'unknown',
  };

  try {
    // Store metrics in KV (aggregate every minute)
    const key = `metrics:${Math.floor(Date.now() / 60000)}`;
    const existing = await env.METRICS.get(key, 'json') || [];

    if (Array.isArray(existing)) {
      existing.push(metrics);
      await env.METRICS.put(key, JSON.stringify(existing), {
        expirationTtl: 3600, // Keep for 1 hour
      });
    }
  } catch (error) {
    console.error('Failed to track metrics:', error);
  }
}

/**
 * Handle errors gracefully
 */
function handleError(error: Error, request: Request): Response {
  console.error('Worker error:', error);

  const isApiRequest = new URL(request.url).pathname.startsWith('/api/');

  if (isApiRequest) {
    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      message: error.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Error - NW London Local Ledger</title>
        <style>
          body { font-family: sans-serif; text-align: center; padding: 50px; }
          h1 { color: #dc2626; }
        </style>
      </head>
      <body>
        <h1>Something went wrong</h1>
        <p>We're having trouble loading this page. Please try again later.</p>
        <a href="/">Go to Homepage</a>
      </body>
    </html>
  `, {
    status: 500,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}