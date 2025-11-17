/**
 * Global Next.js Middleware
 * Applies compression, caching, performance monitoring, and optimizations to all routes
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { monitoringService } from '@/lib/monitoring/monitoring-service';

export function middleware(request: NextRequest) {
  const startTime = Date.now();
  const method = request.method;
  const path = request.nextUrl.pathname;

  // Start monitoring operation if not a static asset
  let requestId = '';
  if (!path.startsWith('/_next/static/') && !path.startsWith('/static/')) {
    requestId = monitoringService.startOperation(`middleware.${method}.${path}`, {
      method,
      path,
      url: request.url,
      headers: Object.fromEntries(request.headers.entries()),
      query: Object.fromEntries(request.nextUrl.searchParams.entries())
    });
  }

  // Get the response
  const response = NextResponse.next();

  // Add request ID to headers for tracing
  if (requestId) {
    response.headers.set('X-Request-Id', requestId);
  }

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

  // End monitoring operation and record metrics
  if (requestId) {
    const totalDuration = Date.now() - startTime;

    // Record API request metrics for API routes
    if (path.startsWith('/api/')) {
      monitoringService.recordApiRequest(
        method,
        path,
        200, // Middleware doesn't have access to final status code
        totalDuration,
        { requestId }
      );
    }

    // End the monitoring operation
    monitoringService.endOperation(requestId, {
      duration: totalDuration,
      type: 'middleware'
    });
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
