/**
 * Middleware Unit Tests
 */

import { NextRequest } from 'next/server';

// Mock the monitoring service before importing middleware
jest.mock('../src/lib/monitoring/monitoring-service', () => ({
  monitoringService: {
    startOperation: jest.fn().mockReturnValue('test-request-id'),
    endOperation: jest.fn(),
    recordApiRequest: jest.fn(),
  },
}));

// We need to dynamically import middleware after mocks are set up
describe('Middleware', () => {
  let middleware: typeof import('../src/middleware').middleware;

  beforeAll(async () => {
    const middlewareModule = await import('../src/middleware');
    middleware = middlewareModule.middleware;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rate Limiting', () => {
    test('should allow requests under rate limit', () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'GET',
        headers: {
          'x-forwarded-for': '192.168.1.1',
        },
      });

      const response = middleware(request);
      expect(response.status).not.toBe(429);
    });

    test('should add security headers', () => {
      const request = new NextRequest('http://localhost:3000/test', {
        method: 'GET',
      });

      const response = middleware(request);
      
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
      expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    });

    test('should add performance headers', () => {
      const request = new NextRequest('http://localhost:3000/test', {
        method: 'GET',
      });

      const response = middleware(request);
      
      expect(response.headers.get('X-Response-Time')).toBeDefined();
      expect(response.headers.get('Server-Timing')).toBeDefined();
    });

    test('should add request ID header', () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'GET',
      });

      const response = middleware(request);
      
      expect(response.headers.get('X-Request-Id')).toBe('test-request-id');
    });
  });

  describe('Cache Control', () => {
    test('should set appropriate cache headers for planning API', () => {
      const request = new NextRequest('http://localhost:3000/api/planning/123', {
        method: 'GET',
      });

      const response = middleware(request);
      
      const cacheControl = response.headers.get('Cache-Control');
      expect(cacheControl).toContain('max-age=3600');
    });

    test('should set appropriate cache headers for properties API', () => {
      const request = new NextRequest('http://localhost:3000/api/properties', {
        method: 'GET',
      });

      const response = middleware(request);
      
      const cacheControl = response.headers.get('Cache-Control');
      expect(cacheControl).toContain('max-age=1800');
    });

    test('should disable cache for health endpoints', () => {
      const request = new NextRequest('http://localhost:3000/api/health', {
        method: 'GET',
      });

      const response = middleware(request);
      
      const cacheControl = response.headers.get('Cache-Control');
      expect(cacheControl).toContain('no-cache');
    });
  });
});
