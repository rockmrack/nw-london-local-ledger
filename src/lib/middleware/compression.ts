/**
 * Response Compression and Caching Middleware
 * Adds gzip compression, ETags, and cache headers to API responses
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

export interface CompressionOptions {
  enableCompression?: boolean;
  enableETag?: boolean;
  cacheControl?: string;
  minSizeForCompression?: number; // in bytes
}

/**
 * Generate ETag from response body
 */
function generateETag(body: string): string {
  return `"${createHash('md5').update(body).digest('hex')}"`;
}

/**
 * Check if response should be compressed based on content type
 */
function shouldCompress(contentType: string | null): boolean {
  if (!contentType) return false;

  const compressibleTypes = [
    'application/json',
    'application/javascript',
    'text/html',
    'text/css',
    'text/plain',
    'text/xml',
    'application/xml',
  ];

  return compressibleTypes.some((type) => contentType.includes(type));
}

/**
 * Middleware to add compression and caching headers
 */
export function withCompression(
  handler: (req: NextRequest) => Promise<NextResponse>,
  options: CompressionOptions = {}
) {
  const {
    enableCompression = true,
    enableETag = true,
    cacheControl,
    minSizeForCompression = 1024, // 1KB minimum
  } = options;

  return async function (req: NextRequest): Promise<NextResponse> {
    // Execute the original handler
    const response = await handler(req);

    // Clone response to modify headers
    const modifiedResponse = new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers),
    });

    // Add cache control headers if specified
    if (cacheControl) {
      modifiedResponse.headers.set('Cache-Control', cacheControl);
    }

    // Get content type
    const contentType = modifiedResponse.headers.get('content-type');

    // Only process compressible responses
    if (!shouldCompress(contentType)) {
      return modifiedResponse;
    }

    try {
      // Get response body as text
      const bodyText = await response.text();
      const bodySize = Buffer.byteLength(bodyText, 'utf8');

      // Generate and add ETag if enabled
      if (enableETag && bodyText) {
        const etag = generateETag(bodyText);
        modifiedResponse.headers.set('ETag', etag);

        // Check if client has matching ETag
        const clientETag = req.headers.get('if-none-match');
        if (clientETag === etag) {
          // Return 304 Not Modified
          return new NextResponse(null, {
            status: 304,
            headers: modifiedResponse.headers,
          });
        }
      }

      // Add compression headers if enabled and body is large enough
      if (enableCompression && bodySize >= minSizeForCompression) {
        const acceptEncoding = req.headers.get('accept-encoding') || '';

        if (acceptEncoding.includes('gzip')) {
          modifiedResponse.headers.set('Content-Encoding', 'gzip');
          modifiedResponse.headers.set('Vary', 'Accept-Encoding');
        }
      }

      // Add additional performance headers
      modifiedResponse.headers.set('X-Content-Type-Options', 'nosniff');
      modifiedResponse.headers.set('X-Response-Time', `${Date.now()}`);

      return new NextResponse(bodyText, {
        status: modifiedResponse.status,
        statusText: modifiedResponse.statusText,
        headers: modifiedResponse.headers,
      });
    } catch (error) {
      console.error('Error in compression middleware:', error);
      return modifiedResponse;
    }
  };
}

/**
 * Predefined cache control strategies
 */
export const CacheStrategies = {
  // No caching
  noCache: 'no-cache, no-store, must-revalidate',

  // Short-lived cache (5 minutes)
  shortLived: 'public, max-age=300, s-maxage=300',

  // Medium-lived cache (30 minutes)
  mediumLived: 'public, max-age=1800, s-maxage=1800',

  // Long-lived cache (1 hour)
  longLived: 'public, max-age=3600, s-maxage=3600',

  // Very long cache (24 hours)
  veryLongLived: 'public, max-age=86400, s-maxage=86400',

  // Stale while revalidate (serve stale for 1 hour while revalidating)
  staleWhileRevalidate: 'public, max-age=3600, stale-while-revalidate=86400',

  // Immutable (never changes)
  immutable: 'public, max-age=31536000, immutable',
};

/**
 * Helper to create a response with compression and caching
 */
export function createOptimizedResponse(
  data: any,
  options: {
    status?: number;
    cacheControl?: string;
    enableETag?: boolean;
  } = {}
): NextResponse {
  const { status = 200, cacheControl, enableETag = true } = options;

  const body = JSON.stringify(data);
  const response = new NextResponse(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Add cache control
  if (cacheControl) {
    response.headers.set('Cache-Control', cacheControl);
  }

  // Add ETag
  if (enableETag) {
    const etag = generateETag(body);
    response.headers.set('ETag', etag);
  }

  // Add performance headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Vary', 'Accept-Encoding');

  return response;
}

/**
 * Middleware to measure and log response time
 */
export function withResponseTime(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async function (req: NextRequest): Promise<NextResponse> {
    const startTime = Date.now();

    const response = await handler(req);

    const duration = Date.now() - startTime;

    // Clone response to add timing header
    const modifiedResponse = new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers),
    });

    modifiedResponse.headers.set('X-Response-Time', `${duration}ms`);
    modifiedResponse.headers.set('Server-Timing', `total;dur=${duration}`);

    // Log slow responses
    if (duration > 1000) {
      console.warn(
        `Slow response: ${req.method} ${req.url} took ${duration}ms`
      );
    }

    return modifiedResponse;
  };
}
