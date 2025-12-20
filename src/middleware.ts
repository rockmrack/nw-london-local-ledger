/**
 * Global Next.js Middleware
 * Applies compression, caching, performance monitoring, and optimizations to all routes
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { LRUCache } from 'lru-cache';

// Rate limiter configuration
// Note: In a distributed Edge environment, this cache is per-isolate.
// For strict global rate limiting, use Redis (e.g., @upstash/ratelimit).
const rateLimit = new LRUCache<string, number>({
  max: 10000, // Track up to 10,000 unique IPs (increased from 500 for better protection)
  ttl: 60 * 1000, // 1 minute window
});

const RATE_LIMIT = 100; // Requests per minute per IP
const RATE_LIMIT_API = 50; // Stricter limit for API routes

export function middleware(request: NextRequest) {
  const startTime = Date.now();
  const method = request.method;
  const path = request.nextUrl.pathname;
  const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown';

  // 1. Rate Limiting Strategy
  if (!path.startsWith('/_next') && !path.startsWith('/static')) {
    const currentUsage = rateLimit.get(ip) || 0;
    const limit = path.startsWith('/api/') ? RATE_LIMIT_API : RATE_LIMIT;
    
    if (currentUsage >= limit) {
      return new NextResponse(JSON.stringify({ 
        error: 'Too Many Requests', 
        message: 'Please try again later.' 
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': '0',
          'Retry-After': '60'
        }
      });
    }
    
    rateLimit.set(ip, currentUsage + 1);
  }

  // Get the response
  const response = NextResponse.next();

  // Add security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Add performance headers
  const duration = Date.now() - startTime;
  response.headers.set('X-Response-Time', `${duration}ms`);
  response.headers.set('Server-Timing', `middleware;dur=${duration}`);

  // Enable compression for API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    response.headers.set('Vary', 'Accept-Encoding');

    // Add appropriate cache headers based on route
    const cacheControl = getCacheControl(request.nextUrl.pathname);
    if (cacheControl) {
      response.headers.set('Cache-Control', cacheControl);
    }
  }

  // Enable static asset caching
  if (
    request.nextUrl.pathname.startsWith('/_next/static/') ||
    request.nextUrl.pathname.startsWith('/static/')
  ) {
    response.headers.set(
      'Cache-Control',
      'public, max-age=31536000, immutable'
    );
  }

  return response;
}

/**
 * Get cache control header based on API route
 */
function getCacheControl(pathname: string): string | null {
  // Planning data - 1 hour
  if (pathname.includes('/api/planning')) {
    return 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400';
  }

  // Property data - 30 minutes
  if (pathname.includes('/api/properties')) {
    return 'public, max-age=1800, s-maxage=1800, stale-while-revalidate=3600';
  }

  // Area data - 24 hours
  if (pathname.includes('/api/areas')) {
    return 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=172800';
  }

  // Search results - 15 minutes
  if (pathname.includes('/api/search')) {
    return 'public, max-age=900, s-maxage=900, stale-while-revalidate=1800';
  }

  // News - 1 hour
  if (pathname.includes('/api/news')) {
    return 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=7200';
  }

  // Health/status endpoints - no cache
  if (pathname.includes('/api/health') || pathname.includes('/api/status')) {
    return 'no-cache, no-store, must-revalidate';
  }

  // Default: 5 minutes
  return 'public, max-age=300, s-maxage=300';
}

// Configure which paths the middleware runs on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
