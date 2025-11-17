/**
 * BullMQ Queue Configuration
 * Centralized configuration for all background job queues
 */

import { QueueOptions, JobsOptions, WorkerOptions } from 'bullmq';

export interface QueueConfig {
  name: string;
  defaultJobOptions: JobsOptions;
  workerOptions: WorkerOptions;
  schedules?: Array<{
    name: string;
    pattern: string; // cron pattern
    data?: any;
  }>;
}

// Default job options with exponential backoff
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 2000, // 2 seconds base delay
  },
  removeOnComplete: {
    age: 24 * 3600, // Keep completed jobs for 24 hours
    count: 100, // Keep last 100 completed jobs
  },
  removeOnFail: {
    age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    count: 500, // Keep last 500 failed jobs
  },
};

// Default worker options
export const DEFAULT_WORKER_OPTIONS: WorkerOptions = {
  concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5'),
  maxStalledCount: 3,
  stalledInterval: 30000, // 30 seconds
};

// Queue configurations
export const QUEUE_CONFIGS: Record<string, QueueConfig> = {
  'scraper-queue': {
    name: 'scraper-queue',
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      attempts: 3, // Fewer retries for scrapers
      backoff: {
        type: 'exponential',
        delay: 5000, // 5 seconds base delay
      },
    },
    workerOptions: {
      ...DEFAULT_WORKER_OPTIONS,
      concurrency: 2, // Limit concurrent scrapers to avoid rate limiting
    },
    schedules: [
      {
        name: 'daily-scraping',
        pattern: process.env.SCRAPER_CRON || '0 2 * * *', // Daily at 2 AM
        data: { all: true },
      },
    ],
  },

  'indexer-queue': {
    name: 'indexer-queue',
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000, // 1 second base delay
      },
    },
    workerOptions: {
      ...DEFAULT_WORKER_OPTIONS,
      concurrency: 10, // Higher concurrency for indexing
    },
    schedules: [], // Triggered after scraping
  },

  'cache-warmer-queue': {
    name: 'cache-warmer-queue',
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      attempts: 2,
      removeOnComplete: {
        age: 3600, // Keep for 1 hour only
        count: 20,
      },
    },
    workerOptions: {
      ...DEFAULT_WORKER_OPTIONS,
      concurrency: 5,
    },
    schedules: [
      {
        name: 'warm-popular-caches',
        pattern: process.env.CACHE_WARMER_CRON || '0 */6 * * *', // Every 6 hours
        data: { type: 'popular' },
      },
      {
        name: 'warm-area-caches',
        pattern: '0 3 * * *', // Daily at 3 AM
        data: { type: 'areas' },
      },
    ],
  },

  'cleanup-queue': {
    name: 'cleanup-queue',
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      attempts: 2,
    },
    workerOptions: {
      ...DEFAULT_WORKER_OPTIONS,
      concurrency: 1, // Run cleanup tasks sequentially
    },
    schedules: [
      {
        name: 'refresh-materialized-views',
        pattern: process.env.MATERIALIZED_VIEW_CRON || '0 3 * * *', // Daily at 3 AM
        data: { task: 'refresh-views' },
      },
      {
        name: 'cleanup-old-data',
        pattern: process.env.CLEANUP_CRON || '0 4 * * 0', // Weekly on Sunday at 4 AM
        data: { task: 'cleanup-old-data' },
      },
      {
        name: 'optimize-database',
        pattern: '0 5 * * 0', // Weekly on Sunday at 5 AM
        data: { task: 'optimize-db' },
      },
    ],
  },
};

// Redis connection configuration
export const REDIS_CONFIG = {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    maxRetriesPerRequest: null, // Required for BullMQ
  },
};

// Get queue names
export const QUEUE_NAMES = Object.keys(QUEUE_CONFIGS);

// Helper to get queue config
export function getQueueConfig(queueName: string): QueueConfig {
  const config = QUEUE_CONFIGS[queueName];
  if (!config) {
    throw new Error(`Queue configuration not found for: ${queueName}`);
  }
  return config;
}

// Job priority levels
export enum JobPriority {
  LOW = 10,
  NORMAL = 0,
  HIGH = -5,
  CRITICAL = -10,
}

// Job status for tracking
export enum JobStatus {
  WAITING = 'waiting',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DELAYED = 'delayed',
  PAUSED = 'paused',
}

// Performance monitoring thresholds
export const PERFORMANCE_THRESHOLDS = {
  slowJobMs: 30000, // 30 seconds
  stalledJobMs: 60000, // 1 minute
  queueSizeWarning: 1000,
  queueSizeCritical: 5000,
  errorRateWarning: 0.1, // 10% error rate
  errorRateCritical: 0.25, // 25% error rate
};