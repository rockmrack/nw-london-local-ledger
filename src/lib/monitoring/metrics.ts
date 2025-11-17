/**
 * Core metrics collection system
 * Provides a unified interface for collecting and exporting performance metrics
 */

import { EventEmitter } from 'events';

export interface MetricValue {
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
}

export interface Histogram {
  observe(value: number, labels?: Record<string, string>): void;
  getPercentile(percentile: number): number;
  reset(): void;
}

export interface Counter {
  inc(value?: number, labels?: Record<string, string>): void;
  get(): number;
  reset(): void;
}

export interface Gauge {
  set(value: number, labels?: Record<string, string>): void;
  inc(value?: number): void;
  dec(value?: number): void;
  get(): number;
}

export interface Summary {
  observe(value: number): void;
  getSum(): number;
  getCount(): number;
  getMean(): number;
  reset(): void;
}

class HistogramImpl implements Histogram {
  private values: MetricValue[] = [];
  private name: string;
  private help: string;
  private buckets: number[];

  constructor(name: string, help: string, buckets?: number[]) {
    this.name = name;
    this.help = help;
    this.buckets = buckets || [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
  }

  observe(value: number, labels?: Record<string, string>): void {
    this.values.push({
      value,
      timestamp: Date.now(),
      labels
    });

    // Keep only last 10000 values to prevent memory issues
    if (this.values.length > 10000) {
      this.values = this.values.slice(-5000);
    }
  }

  getPercentile(percentile: number): number {
    if (this.values.length === 0) return 0;

    const sorted = this.values.map(v => v.value).sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  getBucketCounts(): Map<number, number> {
    const counts = new Map<number, number>();
    this.buckets.forEach(bucket => counts.set(bucket, 0));

    this.values.forEach(({ value }) => {
      for (const bucket of this.buckets) {
        if (value <= bucket) {
          counts.set(bucket, (counts.get(bucket) || 0) + 1);
        }
      }
    });

    return counts;
  }

  reset(): void {
    this.values = [];
  }

  toPrometheus(): string {
    const bucketCounts = this.getBucketCounts();
    let output = `# HELP ${this.name} ${this.help}\n`;
    output += `# TYPE ${this.name} histogram\n`;

    let cumulative = 0;
    for (const [bucket, count] of bucketCounts) {
      cumulative += count;
      output += `${this.name}_bucket{le="${bucket}"} ${cumulative}\n`;
    }
    output += `${this.name}_bucket{le="+Inf"} ${this.values.length}\n`;
    output += `${this.name}_sum ${this.values.reduce((sum, v) => sum + v.value, 0)}\n`;
    output += `${this.name}_count ${this.values.length}\n`;

    return output;
  }
}

class CounterImpl implements Counter {
  private value: number = 0;
  private name: string;
  private help: string;
  private labeledValues: Map<string, number> = new Map();

  constructor(name: string, help: string) {
    this.name = name;
    this.help = help;
  }

  inc(value: number = 1, labels?: Record<string, string>): void {
    this.value += value;

    if (labels) {
      const key = JSON.stringify(labels);
      this.labeledValues.set(key, (this.labeledValues.get(key) || 0) + value);
    }
  }

  get(): number {
    return this.value;
  }

  reset(): void {
    this.value = 0;
    this.labeledValues.clear();
  }

  toPrometheus(): string {
    let output = `# HELP ${this.name} ${this.help}\n`;
    output += `# TYPE ${this.name} counter\n`;

    if (this.labeledValues.size === 0) {
      output += `${this.name} ${this.value}\n`;
    } else {
      for (const [labelsStr, value] of this.labeledValues) {
        const labels = JSON.parse(labelsStr);
        const labelStr = Object.entries(labels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(',');
        output += `${this.name}{${labelStr}} ${value}\n`;
      }
    }

    return output;
  }
}

class GaugeImpl implements Gauge {
  private value: number = 0;
  private name: string;
  private help: string;
  private labeledValues: Map<string, number> = new Map();

  constructor(name: string, help: string) {
    this.name = name;
    this.help = help;
  }

  set(value: number, labels?: Record<string, string>): void {
    this.value = value;

    if (labels) {
      const key = JSON.stringify(labels);
      this.labeledValues.set(key, value);
    }
  }

  inc(value: number = 1): void {
    this.value += value;
  }

  dec(value: number = 1): void {
    this.value -= value;
  }

  get(): number {
    return this.value;
  }

  toPrometheus(): string {
    let output = `# HELP ${this.name} ${this.help}\n`;
    output += `# TYPE ${this.name} gauge\n`;

    if (this.labeledValues.size === 0) {
      output += `${this.name} ${this.value}\n`;
    } else {
      for (const [labelsStr, value] of this.labeledValues) {
        const labels = JSON.parse(labelsStr);
        const labelStr = Object.entries(labels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(',');
        output += `${this.name}{${labelStr}} ${value}\n`;
      }
    }

    return output;
  }
}

class SummaryImpl implements Summary {
  private values: number[] = [];
  private name: string;
  private help: string;

  constructor(name: string, help: string) {
    this.name = name;
    this.help = help;
  }

  observe(value: number): void {
    this.values.push(value);

    // Keep only last 10000 values
    if (this.values.length > 10000) {
      this.values = this.values.slice(-5000);
    }
  }

  getSum(): number {
    return this.values.reduce((sum, v) => sum + v, 0);
  }

  getCount(): number {
    return this.values.length;
  }

  getMean(): number {
    if (this.values.length === 0) return 0;
    return this.getSum() / this.getCount();
  }

  reset(): void {
    this.values = [];
  }

  toPrometheus(): string {
    let output = `# HELP ${this.name} ${this.help}\n`;
    output += `# TYPE ${this.name} summary\n`;
    output += `${this.name}_sum ${this.getSum()}\n`;
    output += `${this.name}_count ${this.getCount()}\n`;

    return output;
  }
}

export class MetricsRegistry extends EventEmitter {
  private histograms: Map<string, HistogramImpl> = new Map();
  private counters: Map<string, CounterImpl> = new Map();
  private gauges: Map<string, GaugeImpl> = new Map();
  private summaries: Map<string, SummaryImpl> = new Map();

  createHistogram(name: string, help: string, buckets?: number[]): Histogram {
    const histogram = new HistogramImpl(name, help, buckets);
    this.histograms.set(name, histogram);
    return histogram;
  }

  createCounter(name: string, help: string): Counter {
    const counter = new CounterImpl(name, help);
    this.counters.set(name, counter);
    return counter;
  }

  createGauge(name: string, help: string): Gauge {
    const gauge = new GaugeImpl(name, help);
    this.gauges.set(name, gauge);
    return gauge;
  }

  createSummary(name: string, help: string): Summary {
    const summary = new SummaryImpl(name, help);
    this.summaries.set(name, summary);
    return summary;
  }

  getMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {};

    for (const [name, histogram] of this.histograms) {
      metrics[name] = {
        type: 'histogram',
        p50: histogram.getPercentile(50),
        p95: histogram.getPercentile(95),
        p99: histogram.getPercentile(99)
      };
    }

    for (const [name, counter] of this.counters) {
      metrics[name] = {
        type: 'counter',
        value: counter.get()
      };
    }

    for (const [name, gauge] of this.gauges) {
      metrics[name] = {
        type: 'gauge',
        value: gauge.get()
      };
    }

    for (const [name, summary] of this.summaries) {
      metrics[name] = {
        type: 'summary',
        sum: summary.getSum(),
        count: summary.getCount(),
        mean: summary.getMean()
      };
    }

    return metrics;
  }

  toPrometheus(): string {
    let output = '';

    for (const histogram of this.histograms.values()) {
      output += histogram.toPrometheus() + '\n';
    }

    for (const counter of this.counters.values()) {
      output += counter.toPrometheus() + '\n';
    }

    for (const gauge of this.gauges.values()) {
      output += gauge.toPrometheus() + '\n';
    }

    for (const summary of this.summaries.values()) {
      output += summary.toPrometheus() + '\n';
    }

    return output;
  }

  reset(): void {
    this.histograms.forEach(h => h.reset());
    this.counters.forEach(c => c.reset());
    this.summaries.forEach(s => s.reset());
    // Don't reset gauges as they represent current state
  }
}

// Global metrics registry
export const metrics = new MetricsRegistry();

// Pre-defined metrics
export const httpRequestDuration = metrics.createHistogram(
  'http_request_duration_seconds',
  'Duration of HTTP requests in seconds',
  [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
);

export const httpRequestTotal = metrics.createCounter(
  'http_requests_total',
  'Total number of HTTP requests'
);

export const httpRequestErrors = metrics.createCounter(
  'http_request_errors_total',
  'Total number of HTTP request errors'
);

export const dbQueryDuration = metrics.createHistogram(
  'db_query_duration_seconds',
  'Duration of database queries in seconds',
  [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
);

export const dbQueryTotal = metrics.createCounter(
  'db_queries_total',
  'Total number of database queries'
);

export const dbConnectionPoolSize = metrics.createGauge(
  'db_connection_pool_size',
  'Current size of database connection pool'
);

export const cacheHits = metrics.createCounter(
  'cache_hits_total',
  'Total number of cache hits'
);

export const cacheMisses = metrics.createCounter(
  'cache_misses_total',
  'Total number of cache misses'
);

export const queueJobsProcessed = metrics.createCounter(
  'queue_jobs_processed_total',
  'Total number of queue jobs processed'
);

export const queueJobsFailed = metrics.createCounter(
  'queue_jobs_failed_total',
  'Total number of queue jobs failed'
);

export const queueJobDuration = metrics.createHistogram(
  'queue_job_duration_seconds',
  'Duration of queue job processing in seconds'
);

export const memoryUsage = metrics.createGauge(
  'process_memory_usage_bytes',
  'Current memory usage in bytes'
);

export const cpuUsage = metrics.createGauge(
  'process_cpu_usage_percent',
  'Current CPU usage percentage'
);