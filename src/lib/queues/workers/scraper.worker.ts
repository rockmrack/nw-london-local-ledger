/**
 * Scraper Queue Worker
 * Processes scraping jobs for council planning applications
 */

import { Worker, Job } from 'bullmq';
import { REDIS_CONFIG, getQueueConfig } from '../config/queue.config';
import { queueService } from '../services/queue.service';
import { logger } from '@/lib/logging/logger';
import { ScraperOrchestrator } from '@/scrapers/orchestrator/ScraperOrchestrator';
import {
  ParallelBarnetScraper,
  ParallelBrentScraper,
  ParallelCamdenScraper,
  ParallelEalingScraper,
  ParallelHarrowScraper,
  ParallelWestminsterScraper,
} from '@/scrapers';
import { connectDb, closeDb } from '@/lib/database/postgres';

interface ScraperJobData {
  council?: string; // Specific council to scrape
  all?: boolean; // Scrape all councils
  fromDate?: string; // ISO date string
  forceRefresh?: boolean;
  indexAfterScraping?: boolean; // Auto-trigger indexing
}

interface ScraperJobResult {
  council?: string;
  totalApplications: number;
  newApplications?: number;
  updatedApplications?: number;
  errors?: string[];
  duration: number;
  indexed?: boolean;
}

class ScraperWorker {
  private worker: Worker<ScraperJobData, ScraperJobResult>;
  private orchestrator: ScraperOrchestrator;
  private councilScrapers: Map<string, any>;

  constructor() {
    this.orchestrator = new ScraperOrchestrator();

    // Initialize individual council scrapers
    this.councilScrapers = new Map([
      ['barnet', new ParallelBarnetScraper()],
      ['brent', new ParallelBrentScraper()],
      ['camden', new ParallelCamdenScraper()],
      ['ealing', new ParallelEalingScraper()],
      ['harrow', new ParallelHarrowScraper()],
      ['westminster', new ParallelWestminsterScraper()],
    ]);

    const config = getQueueConfig('scraper-queue');

    this.worker = new Worker<ScraperJobData, ScraperJobResult>(
      'scraper-queue',
      async (job: Job<ScraperJobData>) => await this.process(job),
      {
        ...config.workerOptions,
        connection: REDIS_CONFIG.connection,
      }
    );

    this.setupEventHandlers();

    // Register worker with queue service
    queueService.registerWorker('scraper-queue', this.worker);
  }

  /**
   * Process a scraping job
   */
  private async process(job: Job<ScraperJobData>): Promise<ScraperJobResult> {
    const startTime = Date.now();
    const { council, all, fromDate, forceRefresh, indexAfterScraping } = job.data;

    logger.info(`[Scraper Worker] Processing job ${job.id}`, {
      council,
      all,
      fromDate,
      forceRefresh,
    });

    // Update job progress
    await job.updateProgress(0);

    try {
      // Connect to database
      await connectDb();

      const scrapeFromDate = fromDate ? new Date(fromDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      let result: ScraperJobResult;

      if (all) {
        // Scrape all councils using orchestrator
        result = await this.scrapeAllCouncils(job, scrapeFromDate);
      } else if (council) {
        // Scrape specific council
        result = await this.scrapeSpecificCouncil(job, council, scrapeFromDate, forceRefresh);
      } else {
        throw new Error('No council specified and "all" flag not set');
      }

      // Trigger indexing if requested
      if (indexAfterScraping && result.totalApplications > 0) {
        await this.triggerIndexing(result);
        result.indexed = true;
      }

      const duration = Date.now() - startTime;
      result.duration = duration;

      logger.info(`[Scraper Worker] Job ${job.id} completed`, result);

      await job.updateProgress(100);
      return result;
    } catch (error) {
      logger.error(`[Scraper Worker] Job ${job.id} failed:`, error);
      throw error;
    } finally {
      // Close database connection
      await closeDb();
    }
  }

  /**
   * Scrape all councils
   */
  private async scrapeAllCouncils(
    job: Job<ScraperJobData>,
    fromDate: Date
  ): Promise<ScraperJobResult> {
    logger.info('[Scraper Worker] Starting orchestrated scraping for all councils');

    const stats = await this.orchestrator.scrapeAll(fromDate);

    // Update progress periodically
    const progressInterval = setInterval(async () => {
      const currentStats = await this.orchestrator.getStatus();
      if (currentStats.isRunning) {
        await job.updateProgress(50);
      }
    }, 5000);

    clearInterval(progressInterval);

    const errors: string[] = [];
    stats.councilStats
      .filter(s => !s.success)
      .forEach(s => {
        errors.push(`${s.council}: ${s.error?.message || 'Unknown error'}`);
      });

    return {
      totalApplications: stats.totalApplications,
      errors: errors.length > 0 ? errors : undefined,
      duration: stats.totalDuration * 1000,
    };
  }

  /**
   * Scrape a specific council
   */
  private async scrapeSpecificCouncil(
    job: Job<ScraperJobData>,
    council: string,
    fromDate: Date,
    forceRefresh?: boolean
  ): Promise<ScraperJobResult> {
    const scraper = this.councilScrapers.get(council.toLowerCase());

    if (!scraper) {
      throw new Error(`Unknown council: ${council}`);
    }

    logger.info(`[Scraper Worker] Scraping ${council} from ${fromDate.toISOString()}`);

    await job.updateProgress(10);

    try {
      const applications = await scraper.scrapePlanningApplications(fromDate);

      await job.updateProgress(60);

      // Save to database (implementation depends on your database structure)
      const saveResult = await this.saveApplications(applications, council, forceRefresh);

      await job.updateProgress(90);

      return {
        council,
        totalApplications: applications.length,
        newApplications: saveResult.new,
        updatedApplications: saveResult.updated,
        duration: 0, // Will be set by caller
      };
    } catch (error) {
      logger.error(`[Scraper Worker] Error scraping ${council}:`, error);
      throw error;
    }
  }

  /**
   * Save applications to database
   */
  private async saveApplications(
    applications: any[],
    council: string,
    forceRefresh?: boolean
  ): Promise<{ new: number; updated: number }> {
    // This is a placeholder - implement based on your database structure
    // You would typically upsert the applications to your database here

    let newCount = 0;
    let updatedCount = 0;

    for (const app of applications) {
      // Check if application exists and update/insert accordingly
      // This is simplified - you'd use actual database operations

      // For now, just count them as new
      newCount++;
    }

    logger.info(`[Scraper Worker] Saved ${newCount} new and ${updatedCount} updated applications for ${council}`);

    return { new: newCount, updated: updatedCount };
  }

  /**
   * Trigger indexing job after successful scraping
   */
  private async triggerIndexing(scrapingResult: ScraperJobResult): Promise<void> {
    try {
      await queueService.addJob('indexer-queue', 'index-planning', {
        source: 'scraper',
        council: scrapingResult.council,
        count: scrapingResult.totalApplications,
      }, {
        priority: -5, // Higher priority
      });

      logger.info('[Scraper Worker] Triggered indexing job');
    } catch (error) {
      logger.error('[Scraper Worker] Failed to trigger indexing:', error);
    }
  }

  /**
   * Setup event handlers for the worker
   */
  private setupEventHandlers(): void {
    this.worker.on('completed', (job: Job<ScraperJobData>, result: ScraperJobResult) => {
      logger.info(`[Scraper Worker] Job ${job.id} completed successfully`, {
        council: job.data.council,
        totalApplications: result.totalApplications,
        duration: result.duration,
      });
    });

    this.worker.on('failed', (job: Job<ScraperJobData> | undefined, error: Error) => {
      if (job) {
        logger.error(`[Scraper Worker] Job ${job.id} failed:`, {
          council: job.data.council,
          error: error.message,
          stack: error.stack,
        });
      }
    });

    this.worker.on('error', (error: Error) => {
      logger.error('[Scraper Worker] Worker error:', error);
    });

    this.worker.on('stalled', (jobId: string) => {
      logger.warn(`[Scraper Worker] Job ${jobId} stalled`);
    });

    this.worker.on('progress', (job: Job<ScraperJobData>, progress: number | object) => {
      logger.debug(`[Scraper Worker] Job ${job.id} progress:`, progress);
    });
  }

  /**
   * Gracefully shutdown the worker
   */
  public async shutdown(): Promise<void> {
    logger.info('[Scraper Worker] Shutting down...');
    await this.worker.close();
    await this.orchestrator.stop();
    logger.info('[Scraper Worker] Shutdown complete');
  }
}

// Export worker instance
let scraperWorker: ScraperWorker | null = null;

export async function startScraperWorker(): Promise<ScraperWorker> {
  if (!scraperWorker) {
    scraperWorker = new ScraperWorker();
  }
  return scraperWorker;
}

export async function stopScraperWorker(): Promise<void> {
  if (scraperWorker) {
    await scraperWorker.shutdown();
    scraperWorker = null;
  }
}