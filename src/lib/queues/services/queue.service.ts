/**
 * BullMQ Queue Service
 * Core service for managing all background job queues
 */

import { Queue, Worker, QueueScheduler, Job, JobType } from 'bullmq';
import { QUEUE_CONFIGS, REDIS_CONFIG, JobPriority, JobStatus } from '../config/queue.config';
import { logger } from '@/lib/logging/logger';
import { EventEmitter } from 'events';

interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
  workersCount: number;
  lastJobTime?: Date;
  avgProcessingTime?: number;
  errorRate?: number;
}

interface JobResult {
  jobId: string;
  queueName: string;
  status: JobStatus;
  data?: any;
  result?: any;
  error?: string;
  attempts?: number;
  processedAt?: Date;
  duration?: number;
}

export class QueueService extends EventEmitter {
  private static instance: QueueService;
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private schedulers: Map<string, QueueScheduler> = new Map();
  private isInitialized = false;
  private performanceMetrics: Map<string, number[]> = new Map();

  private constructor() {
    super();
  }

  public static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }

  /**
   * Initialize all queues
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.info('Queue service already initialized');
      return;
    }

    try {
      logger.info('Initializing BullMQ queue service...');

      // Create queues and schedulers
      for (const [name, config] of Object.entries(QUEUE_CONFIGS)) {
        await this.createQueue(name, config);
      }

      this.isInitialized = true;
      logger.info('✅ Queue service initialized successfully');

      // Start monitoring
      this.startMonitoring();
    } catch (error) {
      logger.error('Failed to initialize queue service:', error);
      throw error;
    }
  }

  /**
   * Create a queue with scheduler
   */
  private async createQueue(name: string, config: any): Promise<void> {
    try {
      // Create queue
      const queue = new Queue(name, {
        connection: REDIS_CONFIG.connection,
        defaultJobOptions: config.defaultJobOptions,
      });

      // Create scheduler for delayed/repeatable jobs
      const scheduler = new QueueScheduler(name, {
        connection: REDIS_CONFIG.connection,
      });

      this.queues.set(name, queue);
      this.schedulers.set(name, scheduler);

      // Setup scheduled jobs
      if (config.schedules && config.schedules.length > 0) {
        for (const schedule of config.schedules) {
          await this.addRepeatingJob(
            name,
            schedule.name,
            schedule.data || {},
            schedule.pattern
          );
        }
      }

      // Setup event listeners
      this.setupQueueEvents(queue);

      logger.info(`✅ Queue created: ${name}`);
    } catch (error) {
      logger.error(`Failed to create queue ${name}:`, error);
      throw error;
    }
  }

  /**
   * Setup event listeners for a queue
   */
  private setupQueueEvents(queue: Queue): void {
    queue.on('completed', (job: Job) => {
      this.recordPerformanceMetric(queue.name, job.finishedOn! - job.processedOn!);
      this.emit('job:completed', {
        queueName: queue.name,
        jobId: job.id,
        data: job.data,
        result: job.returnvalue,
      });
    });

    queue.on('failed', (job: Job | undefined, err: Error) => {
      if (job) {
        logger.error(`Job ${job.id} failed in queue ${queue.name}:`, err);
        this.emit('job:failed', {
          queueName: queue.name,
          jobId: job.id,
          data: job.data,
          error: err.message,
          attempts: job.attemptsMade,
        });
      }
    });

    queue.on('stalled', (jobId: string) => {
      logger.warn(`Job ${jobId} stalled in queue ${queue.name}`);
      this.emit('job:stalled', {
        queueName: queue.name,
        jobId,
      });
    });
  }

  /**
   * Add a job to a queue
   */
  public async addJob<T = any>(
    queueName: string,
    jobName: string,
    data: T,
    options?: {
      priority?: JobPriority;
      delay?: number;
      attempts?: number;
      backoff?: any;
      removeOnComplete?: boolean | number | { age?: number; count?: number };
      removeOnFail?: boolean | number | { age?: number; count?: number };
    }
  ): Promise<Job> {
    const queue = this.getQueue(queueName);

    const job = await queue.add(jobName, data, {
      ...options,
      timestamp: Date.now(),
    });

    logger.info(`Job ${job.id} added to queue ${queueName}`);

    this.emit('job:added', {
      queueName,
      jobId: job.id,
      jobName,
      data,
    });

    return job;
  }

  /**
   * Add a repeating/scheduled job
   */
  public async addRepeatingJob<T = any>(
    queueName: string,
    jobName: string,
    data: T,
    cronPattern: string,
    options?: any
  ): Promise<void> {
    const queue = this.getQueue(queueName);

    await queue.add(jobName, data, {
      ...options,
      repeat: {
        pattern: cronPattern,
        tz: 'Europe/London',
      },
    });

    logger.info(`Repeating job ${jobName} added to queue ${queueName} with pattern ${cronPattern}`);
  }

  /**
   * Bulk add jobs for better performance
   */
  public async bulkAddJobs<T = any>(
    queueName: string,
    jobs: Array<{
      name: string;
      data: T;
      opts?: any;
    }>
  ): Promise<Job[]> {
    const queue = this.getQueue(queueName);

    const bulkJobs = await queue.addBulk(jobs);

    logger.info(`${jobs.length} jobs added to queue ${queueName} in bulk`);

    return bulkJobs;
  }

  /**
   * Get a queue instance
   */
  public getQueue(queueName: string): Queue {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }
    return queue;
  }

  /**
   * Get all queue statistics
   */
  public async getQueueStats(): Promise<QueueStats[]> {
    const stats: QueueStats[] = [];

    for (const [name, queue] of this.queues) {
      const counts = await queue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
        'paused'
      );

      const isPaused = await queue.isPaused();
      const worker = this.workers.get(name);
      const metrics = this.performanceMetrics.get(name) || [];

      stats.push({
        name,
        waiting: counts.waiting,
        active: counts.active,
        completed: counts.completed,
        failed: counts.failed,
        delayed: counts.delayed,
        paused: isPaused,
        workersCount: worker ? 1 : 0,
        avgProcessingTime: metrics.length > 0
          ? metrics.reduce((a, b) => a + b, 0) / metrics.length
          : undefined,
        errorRate: counts.completed + counts.failed > 0
          ? counts.failed / (counts.completed + counts.failed)
          : 0,
      });
    }

    return stats;
  }

  /**
   * Get detailed queue status
   */
  public async getQueueStatus(queueName: string): Promise<{
    stats: QueueStats;
    recentJobs: Job[];
    failedJobs: Job[];
    activeJobs: Job[];
  }> {
    const queue = this.getQueue(queueName);

    const counts = await queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
      'paused'
    );

    const [recentJobs, failedJobs, activeJobs] = await Promise.all([
      queue.getJobs(['completed'], 0, 10),
      queue.getJobs(['failed'], 0, 10),
      queue.getJobs(['active']),
    ]);

    const isPaused = await queue.isPaused();
    const worker = this.workers.get(queueName);
    const metrics = this.performanceMetrics.get(queueName) || [];

    const stats: QueueStats = {
      name: queueName,
      waiting: counts.waiting,
      active: counts.active,
      completed: counts.completed,
      failed: counts.failed,
      delayed: counts.delayed,
      paused: isPaused,
      workersCount: worker ? 1 : 0,
      avgProcessingTime: metrics.length > 0
        ? metrics.reduce((a, b) => a + b, 0) / metrics.length
        : undefined,
      errorRate: counts.completed + counts.failed > 0
        ? counts.failed / (counts.completed + counts.failed)
        : 0,
    };

    return {
      stats,
      recentJobs,
      failedJobs,
      activeJobs,
    };
  }

  /**
   * Pause a queue
   */
  public async pauseQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.pause();

    const worker = this.workers.get(queueName);
    if (worker) {
      await worker.pause();
    }

    logger.info(`Queue ${queueName} paused`);
    this.emit('queue:paused', { queueName });
  }

  /**
   * Resume a queue
   */
  public async resumeQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.resume();

    const worker = this.workers.get(queueName);
    if (worker) {
      await worker.resume();
    }

    logger.info(`Queue ${queueName} resumed`);
    this.emit('queue:resumed', { queueName });
  }

  /**
   * Clean completed/failed jobs
   */
  public async cleanQueue(
    queueName: string,
    grace: number = 0,
    limit: number = 100,
    status: 'completed' | 'failed' = 'completed'
  ): Promise<string[]> {
    const queue = this.getQueue(queueName);
    const cleaned = await queue.clean(grace, limit, status);

    logger.info(`Cleaned ${cleaned.length} ${status} jobs from queue ${queueName}`);
    return cleaned;
  }

  /**
   * Retry all failed jobs
   */
  public async retryFailedJobs(queueName: string, limit?: number): Promise<number> {
    const queue = this.getQueue(queueName);
    const failedJobs = await queue.getJobs(['failed'], 0, limit || 100);

    let retriedCount = 0;
    for (const job of failedJobs) {
      await job.retry();
      retriedCount++;
    }

    logger.info(`Retried ${retriedCount} failed jobs in queue ${queueName}`);
    return retriedCount;
  }

  /**
   * Remove a specific job
   */
  public async removeJob(queueName: string, jobId: string): Promise<void> {
    const queue = this.getQueue(queueName);
    const job = await queue.getJob(jobId);

    if (job) {
      await job.remove();
      logger.info(`Job ${jobId} removed from queue ${queueName}`);
    }
  }

  /**
   * Drain a queue (remove all jobs)
   */
  public async drainQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.drain();

    logger.warn(`Queue ${queueName} drained - all jobs removed`);
    this.emit('queue:drained', { queueName });
  }

  /**
   * Register a worker for a queue
   */
  public registerWorker(queueName: string, worker: Worker): void {
    this.workers.set(queueName, worker);
    logger.info(`Worker registered for queue ${queueName}`);
  }

  /**
   * Record performance metrics
   */
  private recordPerformanceMetric(queueName: string, duration: number): void {
    if (!this.performanceMetrics.has(queueName)) {
      this.performanceMetrics.set(queueName, []);
    }

    const metrics = this.performanceMetrics.get(queueName)!;
    metrics.push(duration);

    // Keep only last 100 metrics
    if (metrics.length > 100) {
      metrics.shift();
    }
  }

  /**
   * Start monitoring queues
   */
  private startMonitoring(): void {
    // Monitor every 30 seconds
    setInterval(async () => {
      try {
        const stats = await this.getQueueStats();

        for (const stat of stats) {
          // Check for warning conditions
          if (stat.waiting > 1000) {
            logger.warn(`Queue ${stat.name} has ${stat.waiting} waiting jobs`);
          }

          if (stat.errorRate && stat.errorRate > 0.1) {
            logger.error(`Queue ${stat.name} has high error rate: ${(stat.errorRate * 100).toFixed(2)}%`);
          }
        }

        this.emit('monitoring:stats', stats);
      } catch (error) {
        logger.error('Error during queue monitoring:', error);
      }
    }, 30000);
  }

  /**
   * Shutdown all queues and workers gracefully
   */
  public async shutdown(): Promise<void> {
    logger.info('Shutting down queue service...');

    try {
      // Close workers first
      for (const [name, worker] of this.workers) {
        await worker.close();
        logger.info(`Worker for queue ${name} closed`);
      }

      // Close schedulers
      for (const [name, scheduler] of this.schedulers) {
        await scheduler.close();
        logger.info(`Scheduler for queue ${name} closed`);
      }

      // Close queues
      for (const [name, queue] of this.queues) {
        await queue.close();
        logger.info(`Queue ${name} closed`);
      }

      this.queues.clear();
      this.workers.clear();
      this.schedulers.clear();
      this.performanceMetrics.clear();

      this.isInitialized = false;
      logger.info('✅ Queue service shutdown complete');
    } catch (error) {
      logger.error('Error during queue service shutdown:', error);
      throw error;
    }
  }

  /**
   * Get job by ID
   */
  public async getJob(queueName: string, jobId: string): Promise<Job | undefined> {
    const queue = this.getQueue(queueName);
    return await queue.getJob(jobId);
  }

  /**
   * Get repeatable jobs
   */
  public async getRepeatableJobs(queueName: string): Promise<any[]> {
    const queue = this.getQueue(queueName);
    return await queue.getRepeatableJobs();
  }

  /**
   * Remove a repeatable job
   */
  public async removeRepeatableJob(
    queueName: string,
    repeatJobKey: string
  ): Promise<boolean> {
    const queue = this.getQueue(queueName);
    return await queue.removeRepeatableByKey(repeatJobKey);
  }
}

// Export singleton instance
export const queueService = QueueService.getInstance();