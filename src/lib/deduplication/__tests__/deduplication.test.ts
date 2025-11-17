/**
 * Tests for Request Deduplication
 */

import { RequestDeduplicator, getGlobalDeduplicator, destroyGlobalDeduplicator } from '../index';

describe('Request Deduplication', () => {
  let deduplicator: RequestDeduplicator;

  beforeEach(() => {
    deduplicator = new RequestDeduplicator({
      ttl: 1000,
      enableMetrics: true,
    });
  });

  afterEach(() => {
    deduplicator.destroy();
    destroyGlobalDeduplicator();
  });

  describe('Basic Functionality', () => {
    it('should deduplicate concurrent identical requests', async () => {
      let executionCount = 0;
      const handler = jest.fn(async () => {
        executionCount++;
        await new Promise(resolve => setTimeout(resolve, 100));
        return { data: 'test' };
      });

      const request = { url: '/api/test', method: 'GET' };

      // Make 5 concurrent identical requests
      const promises = Array(5).fill(null).map(() =>
        deduplicator.execute(request, handler)
      );

      const results = await Promise.all(promises);

      // Handler should only be called once
      expect(handler).toHaveBeenCalledTimes(1);
      expect(executionCount).toBe(1);

      // All results should be identical
      results.forEach(result => {
        expect(result).toEqual({ data: 'test' });
      });

      // Check metrics
      const metrics = deduplicator.getMetrics();
      expect(metrics.totalRequests).toBe(5);
      expect(metrics.uniqueRequests).toBe(1);
      expect(metrics.duplicateRequests).toBe(4);
      expect(metrics.coalescedRequests).toBe(4);
    });

    it('should not deduplicate different requests', async () => {
      const handler = jest.fn(async () => ({ data: 'test' }));

      const request1 = { url: '/api/test1', method: 'GET' };
      const request2 = { url: '/api/test2', method: 'GET' };

      const [result1, result2] = await Promise.all([
        deduplicator.execute(request1, handler),
        deduplicator.execute(request2, handler),
      ]);

      // Handler should be called twice
      expect(handler).toHaveBeenCalledTimes(2);

      // Check metrics
      const metrics = deduplicator.getMetrics();
      expect(metrics.uniqueRequests).toBe(2);
      expect(metrics.duplicateRequests).toBe(0);
    });

    it('should handle request errors properly', async () => {
      const error = new Error('Test error');
      const handler = jest.fn(async () => {
        throw error;
      });

      const request = { url: '/api/error', method: 'GET' };

      // Make 3 concurrent requests
      const promises = Array(3).fill(null).map(() =>
        deduplicator.execute(request, handler).catch(e => e)
      );

      const results = await Promise.all(promises);

      // Handler should only be called once
      expect(handler).toHaveBeenCalledTimes(1);

      // All should receive the same error
      results.forEach(result => {
        expect(result).toBe(error);
      });

      // Check metrics
      const metrics = deduplicator.getMetrics();
      expect(metrics.errors).toBe(1);
    });
  });

  describe('TTL and Cleanup', () => {
    it('should allow duplicate requests after TTL expires', async () => {
      const handler = jest.fn(async () => ({ data: 'test' }));
      const request = { url: '/api/ttl', method: 'GET' };

      // First request
      await deduplicator.execute(request, handler);
      expect(handler).toHaveBeenCalledTimes(1);

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Second request (should not be deduplicated)
      await deduplicator.execute(request, handler);
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should cleanup expired pending requests', async () => {
      const dedup = new RequestDeduplicator({ ttl: 100 });

      const handler = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return { data: 'test' };
      });

      const request = { url: '/api/cleanup', method: 'GET' };

      // Start request but don't await
      const promise = dedup.execute(request, handler).catch(e => e);

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 150));

      const result = await promise;
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('Request timeout');

      dedup.destroy();
    });
  });

  describe('Custom Key Generation', () => {
    it('should use custom key generator', async () => {
      const customDedup = new RequestDeduplicator({
        keyGenerator: (request) => `custom-${request.id}`,
      });

      const handler = jest.fn(async () => ({ data: 'test' }));

      // Same ID should be deduplicated
      const promises1 = Array(3).fill(null).map(() =>
        customDedup.execute({ id: '123' }, handler)
      );
      await Promise.all(promises1);
      expect(handler).toHaveBeenCalledTimes(1);

      // Different ID should not be deduplicated
      await customDedup.execute({ id: '456' }, handler);
      expect(handler).toHaveBeenCalledTimes(2);

      customDedup.destroy();
    });
  });

  describe('Performance Metrics', () => {
    it('should track average wait time', async () => {
      const handler = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { data: 'test' };
      };

      const request = { url: '/api/metrics', method: 'GET' };

      // Make concurrent requests
      const promises = Array(3).fill(null).map(() =>
        deduplicator.execute(request, handler)
      );
      await Promise.all(promises);

      const metrics = deduplicator.getMetrics();
      expect(metrics.avgWaitTime).toBeGreaterThan(0);
      expect(metrics.avgWaitTime).toBeLessThan(100);
    });

    it('should calculate deduplication rate', async () => {
      const handler = jest.fn(async () => ({ data: 'test' }));

      // Make requests with different deduplication patterns
      await deduplicator.execute({ url: '/api/1' }, handler);
      await Promise.all([
        deduplicator.execute({ url: '/api/2' }, handler),
        deduplicator.execute({ url: '/api/2' }, handler),
        deduplicator.execute({ url: '/api/2' }, handler),
      ]);

      const metrics = deduplicator.getMetrics();
      expect(metrics.totalRequests).toBe(4);
      expect(metrics.duplicateRequests).toBe(2);
      expect(metrics.deduplicationRate).toBe(0.5);
    });
  });

  describe('Global Deduplicator', () => {
    it('should maintain singleton instance', () => {
      const dedup1 = getGlobalDeduplicator();
      const dedup2 = getGlobalDeduplicator();

      expect(dedup1).toBe(dedup2);
    });

    it('should destroy global instance', () => {
      const dedup1 = getGlobalDeduplicator();
      destroyGlobalDeduplicator();
      const dedup2 = getGlobalDeduplicator();

      expect(dedup1).not.toBe(dedup2);
    });
  });

  describe('Event Emitters', () => {
    it('should emit success events', async () => {
      const successHandler = jest.fn();
      deduplicator.on('request:success', successHandler);

      const handler = async () => ({ data: 'test' });
      const request = { url: '/api/events' };

      await deduplicator.execute(request, handler);

      expect(successHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          key: expect.any(String),
          waiters: 0,
          duration: expect.any(Number),
        })
      );
    });

    it('should emit error events', async () => {
      const errorHandler = jest.fn();
      deduplicator.on('request:error', errorHandler);

      const error = new Error('Test error');
      const handler = async () => { throw error; };
      const request = { url: '/api/error-event' };

      await deduplicator.execute(request, handler).catch(() => {});

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          key: expect.any(String),
          waiters: 0,
          error,
        })
      );
    });
  });

  describe('Concurrency Limits', () => {
    it('should respect max concurrent requests', async () => {
      const limitedDedup = new RequestDeduplicator({
        maxConcurrentRequests: 2,
      });

      const handler = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { data: 'test' };
      };

      // Try to exceed limit
      const promises = [
        limitedDedup.execute({ url: '/api/1' }, handler),
        limitedDedup.execute({ url: '/api/2' }, handler),
        limitedDedup.execute({ url: '/api/3' }, handler).catch(e => e),
      ];

      const results = await Promise.all(promises);

      expect(results[2]).toBeInstanceOf(Error);
      expect(results[2].message).toContain('Max concurrent requests exceeded');

      limitedDedup.destroy();
    });
  });
});