/**
 * Queue-Integrated Scraper Orchestrator
 * Enhanced orchestrator that integrates with the BullMQ queue system
 */

import { ScraperOrchestrator } from './ScraperOrchestrator';
import { queueService } from '@/lib/queues/services/queue.service';
import { logger } from '@/lib/logging/logger';
import type { PlanningApplication } from '@/types/planning';

export interface QueuedScraperOptions {
  useQueue?: boolean;
  indexAfterScraping?: boolean;
  cacheWarmingAfter?: boolean;
  priority?: number;
}

export class QueueIntegratedOrchestrator extends ScraperOrchestrator {
  /**
   * Queue-aware scraping with automatic job distribution
   */
  async queueScrapeAll(
    fromDate: Date,
    options: QueuedScraperOptions = {}
  ): Promise<{ jobIds: string[]; message: string }> {
    const { useQueue = true, indexAfterScraping = true, priority = 0 } = options;

    if (!useQueue) {
      // Fall back to direct scraping
      const stats = await this.scrapeAll(fromDate);
      return {
        jobIds: [],
        message: `Direct scraping completed: ${stats.totalApplications} applications`,
      };
    }

    logger.info('Queueing scraping jobs for all councils');

    const jobIds: string[] = [];
    const councils = ['barnet', 'brent', 'camden', 'ealing', 'harrow', 'westminster'];

    // Queue individual council scraping jobs for better parallelization
    for (const council of councils) {
      const job = await queueService.addJob(
        'scraper-queue',
        `scrape-${council}`,
        {
          council,
          fromDate: fromDate.toISOString(),
          indexAfterScraping,
        },
        {
          priority,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        }
      );

      jobIds.push(job.id!);
      logger.info(`Queued scraping job for ${council}: ${job.id}`);
    }

    // Queue cache warming after all scraping completes
    if (options.cacheWarmingAfter) {
      const cacheJob = await queueService.addJob(
        'cache-warmer-queue',
        'warm-after-scraping',
        {
          type: 'planning',
          force: true,
        },
        {
          delay: 60000, // Delay by 1 minute to allow scraping to complete
        }
      );
      jobIds.push(cacheJob.id!);
    }

    return {
      jobIds,
      message: `Queued ${councils.length} scraping jobs`,
    };
  }

  /**
   * Queue a single council scraping job
   */
  async queueScrapeCouncil(
    council: string,
    fromDate: Date,
    options: QueuedScraperOptions = {}
  ): Promise<{ jobId: string; message: string }> {
    const { indexAfterScraping = true, priority = 0 } = options;

    const job = await queueService.addJob(
      'scraper-queue',
      `scrape-${council}`,
      {
        council,
        fromDate: fromDate.toISOString(),
        indexAfterScraping,
      },
      {
        priority,
      }
    );

    logger.info(`Queued scraping job for ${council}: ${job.id}`);

    return {
      jobId: job.id!,
      message: `Queued scraping job for ${council}`,
    };
  }

  /**
   * Queue bulk indexing after scraping
   */
  async queueBulkIndexing(
    applications: PlanningApplication[],
    council?: string
  ): Promise<{ jobId: string }> {
    // Group applications by council if not specified
    const grouped = council
      ? { [council]: applications }
      : applications.reduce((acc, app) => {
          const c = app.council || 'unknown';
          if (!acc[c]) acc[c] = [];
          acc[c].push(app);
          return acc;
        }, {} as Record<string, PlanningApplication[]>);

    const jobIds: string[] = [];

    for (const [councilName, apps] of Object.entries(grouped)) {
      if (apps.length === 0) continue;

      const job = await queueService.addJob(
        'indexer-queue',
        'bulk-index-planning',
        {
          type: 'planning',
          operation: 'bulk',
          council: councilName,
          ids: apps.map(a => a.id).filter(Boolean),
        },
        {
          priority: -5, // Higher priority for post-scraping indexing
        }
      );

      jobIds.push(job.id!);
      logger.info(`Queued bulk indexing for ${apps.length} ${councilName} applications: ${job.id}`);
    }

    return {
      jobId: jobIds[0] || 'none',
    };
  }

  /**
   * Get status of scraping jobs
   */
  async getQueueStatus(): Promise<{
    queued: number;
    active: number;
    completed: number;
    failed: number;
    jobs: any[];
  }> {
    const queue = queueService.getQueue('scraper-queue');

    const counts = await queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed'
    );

    const [activeJobs, completedJobs, failedJobs] = await Promise.all([
      queue.getJobs(['active'], 0, 10),
      queue.getJobs(['completed'], 0, 10),
      queue.getJobs(['failed'], 0, 10),
    ]);

    return {
      queued: counts.waiting,
      active: counts.active,
      completed: counts.completed,
      failed: counts.failed,
      jobs: [...activeJobs, ...completedJobs, ...failedJobs].map(job => ({
        id: job.id,
        name: job.name,
        data: job.data,
        status: job.finishedOn
          ? job.returnvalue
            ? 'completed'
            : 'failed'
          : 'active',
        progress: job.progress,
        attemptsMade: job.attemptsMade,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        failedReason: job.failedReason,
      })),
    };
  }

  /**
   * Cancel all pending scraping jobs
   */
  async cancelPendingJobs(): Promise<{ cancelled: number }> {
    const queue = queueService.getQueue('scraper-queue');
    const waitingJobs = await queue.getJobs(['wait', 'delayed']);

    let cancelled = 0;
    for (const job of waitingJobs) {
      await job.remove();
      cancelled++;
    }

    logger.info(`Cancelled ${cancelled} pending scraping jobs`);

    return { cancelled };
  }

  /**
   * Retry all failed scraping jobs
   */
  async retryFailedJobs(limit?: number): Promise<{ retried: number }> {
    const retried = await queueService.retryFailedJobs('scraper-queue', limit);

    logger.info(`Retried ${retried} failed scraping jobs`);

    return { retried };
  }

  /**
   * Schedule recurring scraping jobs
   */
  async scheduleRecurringScraping(
    pattern: string = '0 2 * * *', // Default: 2 AM daily
    options: QueuedScraperOptions = {}
  ): Promise<{ scheduled: boolean; pattern: string }> {
    const { indexAfterScraping = true } = options;

    await queueService.addRepeatingJob(
      'scraper-queue',
      'scheduled-scrape-all',
      {
        all: true,
        fromDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // Last 7 days
        indexAfterScraping,
      },
      pattern
    );

    logger.info(`Scheduled recurring scraping with pattern: ${pattern}`);

    return {
      scheduled: true,
      pattern,
    };
  }

  /**
   * Get metrics for scraping performance
   */
  async getScrapingMetrics(): Promise<{
    totalScraped: number;
    successRate: number;
    avgDuration: number;
    councilBreakdown: Record<string, {
      scraped: number;
      success: number;
      failed: number;
      avgDuration: number;
    }>;
  }> {
    const queue = queueService.getQueue('scraper-queue');
    const completedJobs = await queue.getJobs(['completed'], 0, 1000);
    const failedJobs = await queue.getJobs(['failed'], 0, 1000);

    const councilMetrics: Record<string, any> = {};

    // Process completed jobs
    for (const job of completedJobs) {
      const council = job.data.council || 'all';
      if (!councilMetrics[council]) {
        councilMetrics[council] = {
          scraped: 0,
          success: 0,
          failed: 0,
          durations: [],
        };
      }

      councilMetrics[council].scraped += job.returnvalue?.totalApplications || 0;
      councilMetrics[council].success++;

      if (job.finishedOn && job.processedOn) {
        councilMetrics[council].durations.push(job.finishedOn - job.processedOn);
      }
    }

    // Process failed jobs
    for (const job of failedJobs) {
      const council = job.data.council || 'all';
      if (!councilMetrics[council]) {
        councilMetrics[council] = {
          scraped: 0,
          success: 0,
          failed: 0,
          durations: [],
        };
      }
      councilMetrics[council].failed++;
    }

    // Calculate aggregates
    let totalScraped = 0;
    const councilBreakdown: Record<string, any> = {};

    for (const [council, metrics] of Object.entries(councilMetrics)) {
      totalScraped += metrics.scraped;
      councilBreakdown[council] = {
        scraped: metrics.scraped,
        success: metrics.success,
        failed: metrics.failed,
        avgDuration: metrics.durations.length > 0
          ? metrics.durations.reduce((a: number, b: number) => a + b, 0) / metrics.durations.length
          : 0,
      };
    }

    const totalJobs = completedJobs.length + failedJobs.length;
    const successRate = totalJobs > 0 ? completedJobs.length / totalJobs : 0;

    // Calculate overall average duration
    const allDurations = Object.values(councilMetrics)
      .flatMap((m: any) => m.durations);
    const avgDuration = allDurations.length > 0
      ? allDurations.reduce((a: number, b: number) => a + b, 0) / allDurations.length
      : 0;

    return {
      totalScraped,
      successRate,
      avgDuration,
      councilBreakdown,
    };
  }
}

// Export singleton instance
export const queueIntegratedOrchestrator = new QueueIntegratedOrchestrator();