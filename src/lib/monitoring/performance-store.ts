/**
 * Performance data storage and retrieval
 */

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const mkdir = promisify(fs.mkdir);
const readdir = promisify(fs.readdir);
const unlink = promisify(fs.unlink);

interface PerformanceData {
  requestId: string;
  operation: string;
  duration: number;
  spans: any[];
  metadata?: Record<string, any>;
  timestamp: number;
}

interface QueryData {
  query: string;
  duration: number;
  metadata?: Record<string, any>;
  timestamp: number;
}

interface ApiRequestData {
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  metadata?: Record<string, any>;
  timestamp: number;
}

interface CacheOperationData {
  hit: boolean;
  key: string;
  metadata?: Record<string, any>;
  timestamp: number;
}

interface QueueJobData {
  jobName: string;
  success: boolean;
  duration: number;
  metadata?: Record<string, any>;
  timestamp: number;
}

interface ErrorData {
  name: string;
  message: string;
  stack?: string;
  context?: Record<string, any>;
  timestamp: number;
}

interface SystemMetricsData {
  memory: {
    total: number;
    free: number;
    used: number;
    usedPercent: number;
  };
  cpu: {
    cores: number;
    usagePercent: number;
    loadAvg: number[];
  };
  uptime: number;
  platform: string;
  nodeVersion: string;
  timestamp?: number;
}

export class PerformanceStore {
  private dataDir: string;
  private inMemoryBuffer: Map<string, any[]> = new Map();
  private flushInterval?: NodeJS.Timeout;
  private aggregationCache: Map<string, any> = new Map();

  constructor(config: any) {
    this.dataDir = process.env.PERFORMANCE_DATA_DIR || './performance_data';
    this.initializeStorage();
    this.startFlushInterval();
  }

  private async initializeStorage(): Promise<void> {
    try {
      await mkdir(this.dataDir, { recursive: true });
      await mkdir(path.join(this.dataDir, 'operations'), { recursive: true });
      await mkdir(path.join(this.dataDir, 'queries'), { recursive: true });
      await mkdir(path.join(this.dataDir, 'api'), { recursive: true });
      await mkdir(path.join(this.dataDir, 'cache'), { recursive: true });
      await mkdir(path.join(this.dataDir, 'queue'), { recursive: true });
      await mkdir(path.join(this.dataDir, 'errors'), { recursive: true });
      await mkdir(path.join(this.dataDir, 'system'), { recursive: true });
      await mkdir(path.join(this.dataDir, 'aggregations'), { recursive: true });
    } catch (error) {
      console.error('Failed to initialize performance storage:', error);
    }
  }

  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      this.flushToDisk();
    }, 30000); // Flush every 30 seconds
  }

  /**
   * Store performance data
   */
  store(data: PerformanceData): void {
    this.addToBuffer('operations', data);
  }

  /**
   * Store query performance
   */
  storeQuery(data: QueryData): void {
    this.addToBuffer('queries', data);
  }

  /**
   * Store API request performance
   */
  storeApiRequest(data: ApiRequestData): void {
    this.addToBuffer('api', data);
  }

  /**
   * Store cache operation
   */
  storeCacheOperation(data: CacheOperationData): void {
    this.addToBuffer('cache', data);
  }

  /**
   * Store queue job performance
   */
  storeQueueJob(data: QueueJobData): void {
    this.addToBuffer('queue', data);
  }

  /**
   * Store error data
   */
  storeError(data: ErrorData): void {
    this.addToBuffer('errors', data);
  }

  /**
   * Store system metrics
   */
  storeSystemMetrics(data: SystemMetricsData): void {
    data.timestamp = Date.now();
    this.addToBuffer('system', data);
  }

  /**
   * Add data to in-memory buffer
   */
  private addToBuffer(type: string, data: any): void {
    const buffer = this.inMemoryBuffer.get(type) || [];
    buffer.push(data);

    // Limit buffer size to prevent memory issues
    if (buffer.length > 1000) {
      // Flush immediately if buffer is getting large
      this.flushBufferType(type);
    } else {
      this.inMemoryBuffer.set(type, buffer);
    }
  }

  /**
   * Flush all buffers to disk
   */
  private async flushToDisk(): Promise<void> {
    const types = Array.from(this.inMemoryBuffer.keys());

    for (const type of types) {
      await this.flushBufferType(type);
    }
  }

  /**
   * Flush specific buffer type to disk
   */
  private async flushBufferType(type: string): Promise<void> {
    const buffer = this.inMemoryBuffer.get(type);
    if (!buffer || buffer.length === 0) return;

    try {
      const timestamp = Date.now();
      const filename = `${type}_${timestamp}.json`;
      const filepath = path.join(this.dataDir, type, filename);

      await writeFile(filepath, JSON.stringify(buffer, null, 2));

      // Clear buffer
      this.inMemoryBuffer.set(type, []);
    } catch (error) {
      console.error(`Failed to flush ${type} buffer to disk:`, error);
    }
  }

  /**
   * Get performance summary
   */
  async getSummary(timeRange: { start: Date; end: Date }) {
    const startTime = timeRange.start.getTime();
    const endTime = timeRange.end.getTime();

    // Check cache first
    const cacheKey = `summary_${startTime}_${endTime}`;
    if (this.aggregationCache.has(cacheKey)) {
      return this.aggregationCache.get(cacheKey);
    }

    const summary = {
      operations: await this.getOperationsSummary(startTime, endTime),
      api: await this.getApiSummary(startTime, endTime),
      database: await this.getDatabaseSummary(startTime, endTime),
      cache: await this.getCacheSummary(startTime, endTime),
      queue: await this.getQueueSummary(startTime, endTime),
      errors: await this.getErrorsSummary(startTime, endTime),
      system: await this.getSystemSummary(startTime, endTime)
    };

    // Cache for 5 minutes
    this.aggregationCache.set(cacheKey, summary);
    setTimeout(() => this.aggregationCache.delete(cacheKey), 300000);

    return summary;
  }

  /**
   * Get operations summary
   */
  private async getOperationsSummary(startTime: number, endTime: number) {
    const data = await this.loadDataInRange('operations', startTime, endTime);

    if (data.length === 0) {
      return { count: 0, avgDuration: 0, p50: 0, p95: 0, p99: 0 };
    }

    const durations = data.map((d: PerformanceData) => d.duration).sort((a, b) => a - b);

    return {
      count: data.length,
      avgDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      p50: this.getPercentile(durations, 50),
      p95: this.getPercentile(durations, 95),
      p99: this.getPercentile(durations, 99),
      byOperation: this.groupByOperation(data)
    };
  }

  /**
   * Get API summary
   */
  private async getApiSummary(startTime: number, endTime: number) {
    const data = await this.loadDataInRange('api', startTime, endTime);

    if (data.length === 0) {
      return { count: 0, avgDuration: 0, errorRate: 0 };
    }

    const errors = data.filter((d: ApiRequestData) => d.statusCode >= 400);

    return {
      count: data.length,
      avgDuration: data.reduce((sum, d) => sum + d.duration, 0) / data.length,
      errorRate: (errors.length / data.length) * 100,
      byEndpoint: this.groupByEndpoint(data),
      byStatus: this.groupByStatus(data)
    };
  }

  /**
   * Get database summary
   */
  private async getDatabaseSummary(startTime: number, endTime: number) {
    const data = await this.loadDataInRange('queries', startTime, endTime);

    if (data.length === 0) {
      return { count: 0, avgDuration: 0, slowQueries: 0 };
    }

    const slowQueries = data.filter((d: QueryData) => d.duration > 100);

    return {
      count: data.length,
      avgDuration: data.reduce((sum, d) => sum + d.duration, 0) / data.length,
      slowQueries: slowQueries.length,
      slowQueryRate: (slowQueries.length / data.length) * 100
    };
  }

  /**
   * Get cache summary
   */
  private async getCacheSummary(startTime: number, endTime: number) {
    const data = await this.loadDataInRange('cache', startTime, endTime);

    if (data.length === 0) {
      return { count: 0, hitRate: 0 };
    }

    const hits = data.filter((d: CacheOperationData) => d.hit);

    return {
      count: data.length,
      hits: hits.length,
      misses: data.length - hits.length,
      hitRate: (hits.length / data.length) * 100
    };
  }

  /**
   * Get queue summary
   */
  private async getQueueSummary(startTime: number, endTime: number) {
    const data = await this.loadDataInRange('queue', startTime, endTime);

    if (data.length === 0) {
      return { count: 0, successRate: 0, avgDuration: 0 };
    }

    const successful = data.filter((d: QueueJobData) => d.success);

    return {
      count: data.length,
      successful: successful.length,
      failed: data.length - successful.length,
      successRate: (successful.length / data.length) * 100,
      avgDuration: data.reduce((sum, d) => sum + d.duration, 0) / data.length,
      byJob: this.groupByJob(data)
    };
  }

  /**
   * Get errors summary
   */
  private async getErrorsSummary(startTime: number, endTime: number) {
    const data = await this.loadDataInRange('errors', startTime, endTime);

    return {
      count: data.length,
      byType: this.groupByErrorType(data),
      recent: data.slice(-10)
    };
  }

  /**
   * Get system summary
   */
  private async getSystemSummary(startTime: number, endTime: number) {
    const data = await this.loadDataInRange('system', startTime, endTime);

    if (data.length === 0) {
      return { avgMemory: 0, avgCpu: 0, maxMemory: 0, maxCpu: 0 };
    }

    const memoryValues = data.map((d: SystemMetricsData) => d.memory.usedPercent);
    const cpuValues = data.map((d: SystemMetricsData) => d.cpu.usagePercent);

    return {
      avgMemory: memoryValues.reduce((sum, v) => sum + v, 0) / memoryValues.length,
      avgCpu: cpuValues.reduce((sum, v) => sum + v, 0) / cpuValues.length,
      maxMemory: Math.max(...memoryValues),
      maxCpu: Math.max(...cpuValues),
      latest: data[data.length - 1]
    };
  }

  /**
   * Get slow queries
   */
  async getSlowQueries(limit: number = 100): Promise<QueryData[]> {
    const allQueries = await this.loadAllData('queries');

    return allQueries
      .filter((q: QueryData) => q.duration > 100)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  /**
   * Get error summary
   */
  async getErrorSummary(timeRange: { start: Date; end: Date }) {
    const errors = await this.loadDataInRange(
      'errors',
      timeRange.start.getTime(),
      timeRange.end.getTime()
    );

    return {
      total: errors.length,
      byType: this.groupByErrorType(errors),
      topErrors: this.getTopErrors(errors),
      timeline: this.getErrorTimeline(errors)
    };
  }

  /**
   * Load data in time range
   */
  private async loadDataInRange(type: string, startTime: number, endTime: number): Promise<any[]> {
    const dir = path.join(this.dataDir, type);
    const allData: any[] = [];

    try {
      const files = await readdir(dir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        // Extract timestamp from filename
        const fileTimestamp = parseInt(file.split('_')[1].split('.')[0]);

        // Skip files outside our time range
        if (fileTimestamp < startTime || fileTimestamp > endTime) continue;

        const filepath = path.join(dir, file);
        const content = await readFile(filepath, 'utf-8');
        const data = JSON.parse(content);

        // Filter data within time range
        const filtered = data.filter((item: any) =>
          item.timestamp >= startTime && item.timestamp <= endTime
        );

        allData.push(...filtered);
      }
    } catch (error) {
      console.error(`Failed to load ${type} data:`, error);
    }

    return allData;
  }

  /**
   * Load all data of a type
   */
  private async loadAllData(type: string): Promise<any[]> {
    const dir = path.join(this.dataDir, type);
    const allData: any[] = [];

    try {
      const files = await readdir(dir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filepath = path.join(dir, file);
        const content = await readFile(filepath, 'utf-8');
        const data = JSON.parse(content);

        allData.push(...data);
      }
    } catch (error) {
      console.error(`Failed to load all ${type} data:`, error);
    }

    return allData;
  }

  /**
   * Aggregate performance data
   */
  async aggregate(): Promise<void> {
    const now = Date.now();
    const hourAgo = now - 3600000;

    // Aggregate hourly data
    const types = ['operations', 'api', 'queries', 'cache', 'queue', 'system'];

    for (const type of types) {
      const data = await this.loadDataInRange(type, hourAgo, now);

      if (data.length > 0) {
        const aggregation = {
          type,
          startTime: hourAgo,
          endTime: now,
          count: data.length,
          data: this.aggregateTypeData(type, data)
        };

        const filename = `${type}_hourly_${now}.json`;
        const filepath = path.join(this.dataDir, 'aggregations', filename);

        await writeFile(filepath, JSON.stringify(aggregation, null, 2));
      }
    }
  }

  /**
   * Aggregate type-specific data
   */
  private aggregateTypeData(type: string, data: any[]): any {
    switch (type) {
      case 'operations':
        return this.aggregateOperations(data);
      case 'api':
        return this.aggregateApi(data);
      case 'queries':
        return this.aggregateQueries(data);
      default:
        return { count: data.length };
    }
  }

  /**
   * Aggregate operations data
   */
  private aggregateOperations(data: PerformanceData[]): any {
    const durations = data.map(d => d.duration);

    return {
      count: data.length,
      avgDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      p50: this.getPercentile(durations.sort((a, b) => a - b), 50),
      p95: this.getPercentile(durations.sort((a, b) => a - b), 95),
      p99: this.getPercentile(durations.sort((a, b) => a - b), 99)
    };
  }

  /**
   * Aggregate API data
   */
  private aggregateApi(data: ApiRequestData[]): any {
    const durations = data.map(d => d.duration);
    const errors = data.filter(d => d.statusCode >= 400);

    return {
      count: data.length,
      avgDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      errorCount: errors.length,
      errorRate: (errors.length / data.length) * 100
    };
  }

  /**
   * Aggregate queries data
   */
  private aggregateQueries(data: QueryData[]): any {
    const durations = data.map(d => d.duration);
    const slowQueries = data.filter(d => d.duration > 100);

    return {
      count: data.length,
      avgDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      slowQueryCount: slowQueries.length,
      slowQueryRate: (slowQueries.length / data.length) * 100
    };
  }

  /**
   * Cleanup old data
   */
  async cleanup(retentionDays: number): Promise<void> {
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    const types = ['operations', 'api', 'queries', 'cache', 'queue', 'errors', 'system'];

    for (const type of types) {
      const dir = path.join(this.dataDir, type);

      try {
        const files = await readdir(dir);

        for (const file of files) {
          if (!file.endsWith('.json')) continue;

          const fileTimestamp = parseInt(file.split('_')[1].split('.')[0]);

          if (fileTimestamp < cutoffTime) {
            await unlink(path.join(dir, file));
          }
        }
      } catch (error) {
        console.error(`Failed to cleanup ${type} data:`, error);
      }
    }
  }

  /**
   * Helper: Get percentile value
   */
  private getPercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)];
  }

  /**
   * Helper: Group by operation
   */
  private groupByOperation(data: PerformanceData[]): Record<string, any> {
    const grouped: Record<string, any> = {};

    for (const item of data) {
      if (!grouped[item.operation]) {
        grouped[item.operation] = { count: 0, totalDuration: 0 };
      }
      grouped[item.operation].count++;
      grouped[item.operation].totalDuration += item.duration;
    }

    for (const op in grouped) {
      grouped[op].avgDuration = grouped[op].totalDuration / grouped[op].count;
    }

    return grouped;
  }

  /**
   * Helper: Group by endpoint
   */
  private groupByEndpoint(data: ApiRequestData[]): Record<string, any> {
    const grouped: Record<string, any> = {};

    for (const item of data) {
      const key = `${item.method} ${item.path}`;
      if (!grouped[key]) {
        grouped[key] = { count: 0, totalDuration: 0, errors: 0 };
      }
      grouped[key].count++;
      grouped[key].totalDuration += item.duration;
      if (item.statusCode >= 400) {
        grouped[key].errors++;
      }
    }

    for (const endpoint in grouped) {
      grouped[endpoint].avgDuration = grouped[endpoint].totalDuration / grouped[endpoint].count;
      grouped[endpoint].errorRate = (grouped[endpoint].errors / grouped[endpoint].count) * 100;
    }

    return grouped;
  }

  /**
   * Helper: Group by status
   */
  private groupByStatus(data: ApiRequestData[]): Record<string, number> {
    const grouped: Record<string, number> = {};

    for (const item of data) {
      const status = item.statusCode.toString();
      grouped[status] = (grouped[status] || 0) + 1;
    }

    return grouped;
  }

  /**
   * Helper: Group by job
   */
  private groupByJob(data: QueueJobData[]): Record<string, any> {
    const grouped: Record<string, any> = {};

    for (const item of data) {
      if (!grouped[item.jobName]) {
        grouped[item.jobName] = { count: 0, successful: 0, failed: 0, totalDuration: 0 };
      }
      grouped[item.jobName].count++;
      grouped[item.jobName].totalDuration += item.duration;
      if (item.success) {
        grouped[item.jobName].successful++;
      } else {
        grouped[item.jobName].failed++;
      }
    }

    for (const job in grouped) {
      grouped[job].avgDuration = grouped[job].totalDuration / grouped[job].count;
      grouped[job].successRate = (grouped[job].successful / grouped[job].count) * 100;
    }

    return grouped;
  }

  /**
   * Helper: Group by error type
   */
  private groupByErrorType(data: ErrorData[]): Record<string, number> {
    const grouped: Record<string, number> = {};

    for (const item of data) {
      grouped[item.name] = (grouped[item.name] || 0) + 1;
    }

    return grouped;
  }

  /**
   * Helper: Get top errors
   */
  private getTopErrors(data: ErrorData[]): any[] {
    const errorCounts: Record<string, number> = {};

    for (const error of data) {
      const key = `${error.name}: ${error.message}`;
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    }

    return Object.entries(errorCounts)
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  /**
   * Helper: Get error timeline
   */
  private getErrorTimeline(data: ErrorData[]): any[] {
    const timeline: Record<number, number> = {};
    const bucketSize = 3600000; // 1 hour buckets

    for (const error of data) {
      const bucket = Math.floor(error.timestamp / bucketSize) * bucketSize;
      timeline[bucket] = (timeline[bucket] || 0) + 1;
    }

    return Object.entries(timeline)
      .map(([timestamp, count]) => ({
        timestamp: parseInt(timestamp),
        count
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Close and cleanup
   */
  close(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flushToDisk();
  }
}