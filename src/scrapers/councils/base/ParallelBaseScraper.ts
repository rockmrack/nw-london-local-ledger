/**
 * Enhanced base class for council scrapers with parallel processing support
 * Extends the original BaseScraper with parallel capabilities
 */

import { BaseScraper, ScraperConfig } from './BaseScraper';
import { ParallelProcessor, BatchProcessor, ProcessResult } from '../../utils/parallel-processor';
import { TokenBucketRateLimiter } from '../../utils/rate-limiter';
import type { PlanningApplication } from '@/types/planning';

export interface ParallelScraperConfig extends ScraperConfig {
  parallelPages: number; // Number of pages to process in parallel
  parallelDetails: number; // Number of detail pages to fetch in parallel
  useBurstRateLimit?: boolean; // Use token bucket for burst handling
  burstCapacity?: number; // Token bucket capacity
}

export abstract class ParallelBaseScraper extends BaseScraper {
  protected parallelConfig: ParallelScraperConfig;
  protected tokenBucketLimiter?: TokenBucketRateLimiter;
  private progressStats = {
    pagesProcessed: 0,
    totalPages: 0,
    applicationsFound: 0,
    errors: 0,
    startTime: Date.now()
  };

  constructor(config: ParallelScraperConfig) {
    super(config);
    this.parallelConfig = config;

    // Initialize token bucket rate limiter if burst mode is enabled
    if (config.useBurstRateLimit) {
      this.tokenBucketLimiter = new TokenBucketRateLimiter(
        config.burstCapacity || config.parallelPages * 2,
        config.rateLimit
      );
    }
  }

  /**
   * Scrape planning applications with parallel processing
   */
  async scrapePlanningApplicationsParallel(fromDate: Date): Promise<PlanningApplication[]> {
    if (!this.validateConfig()) {
      throw new Error('Invalid scraper configuration');
    }

    this.log(`Starting parallel scrape from ${fromDate.toISOString()}`);
    this.progressStats.startTime = Date.now();

    try {
      // First, determine the total number of pages
      const totalPages = await this.getTotalPages(fromDate);
      this.progressStats.totalPages = totalPages;
      this.log(`Found ${totalPages} pages to scrape`);

      if (totalPages === 0) {
        return [];
      }

      // Generate page numbers to scrape
      const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

      // Process pages in parallel chunks
      const processor = new BatchProcessor();
      const { results, errors } = await processor.processBatch(
        pageNumbers,
        async (pageNum) => await this.scrapePage(fromDate, pageNum),
        this.parallelConfig.parallelPages,
        (progress) => this.reportProgress(progress)
      );

      // Flatten results
      const applications = results.flat();

      // Log final statistics
      this.logFinalStats(applications.length, errors.length);

      return applications;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Scrape multiple planning details in parallel
   */
  async scrapePlanningDetailsParallel(references: string[]): Promise<PlanningApplication[]> {
    this.log(`Starting parallel detail scrape for ${references.length} applications`);

    const processor = new BatchProcessor();
    const { results, errors } = await processor.processBatch(
      references,
      async (ref) => {
        const result = await this.scrapePlanningDetails(ref);
        return result;
      },
      this.parallelConfig.parallelDetails,
      (progress) => {
        this.log(`Details progress: ${progress.completed}/${progress.total} (${progress.percentage}%)`);
      }
    );

    if (errors.length > 0) {
      this.log(`Failed to fetch details for ${errors.length} applications`, 'warn');
    }

    return results.filter(app => app !== null) as PlanningApplication[];
  }

  /**
   * Scrape a single page (to be implemented by subclasses)
   */
  protected abstract scrapePage(fromDate: Date, pageNumber: number): Promise<PlanningApplication[]>;

  /**
   * Get total number of pages (to be implemented by subclasses)
   */
  protected abstract getTotalPages(fromDate: Date): Promise<number>;

  /**
   * Override fetch to use token bucket if enabled
   */
  protected async fetch(url: string, options?: RequestInit): Promise<Response> {
    // Use token bucket rate limiter if available
    if (this.tokenBucketLimiter) {
      await this.tokenBucketLimiter.acquire();
    } else {
      await this.rateLimiter.acquire();
    }

    return super.fetch(url, options);
  }

  /**
   * Report progress during scraping
   */
  private reportProgress(progress: {
    total: number;
    completed: number;
    success: number;
    errors: number;
    percentage: number;
  }): void {
    this.progressStats.pagesProcessed = progress.completed;
    this.progressStats.errors = progress.errors;

    const elapsedSeconds = (Date.now() - this.progressStats.startTime) / 1000;
    const pagesPerSecond = progress.completed / elapsedSeconds;
    const estimatedTimeRemaining = (progress.total - progress.completed) / pagesPerSecond;

    this.log(
      `Progress: ${progress.completed}/${progress.total} pages (${progress.percentage}%) | ` +
      `Speed: ${pagesPerSecond.toFixed(2)} pages/sec | ` +
      `ETA: ${this.formatTime(estimatedTimeRemaining)} | ` +
      `Errors: ${progress.errors}`
    );
  }

  /**
   * Log final scraping statistics
   */
  private logFinalStats(totalApplications: number, errorCount: number): void {
    const elapsedSeconds = (Date.now() - this.progressStats.startTime) / 1000;

    this.log('='.repeat(60));
    this.log('Scraping completed!');
    this.log(`Total applications found: ${totalApplications}`);
    this.log(`Pages processed: ${this.progressStats.pagesProcessed}`);
    this.log(`Errors encountered: ${errorCount}`);
    this.log(`Time taken: ${this.formatTime(elapsedSeconds)}`);
    this.log(`Average speed: ${(this.progressStats.pagesProcessed / elapsedSeconds).toFixed(2)} pages/sec`);
    this.log('='.repeat(60));
  }

  /**
   * Format time in seconds to human-readable format
   */
  private formatTime(seconds: number): string {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.round(seconds % 60);
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }

  /**
   * Process pages with controlled concurrency and error recovery
   */
  protected async processPagesConcurrently(
    pageNumbers: number[],
    processor: (pageNum: number) => Promise<PlanningApplication[]>,
    concurrency: number = 5
  ): Promise<PlanningApplication[]> {
    const results = await ParallelProcessor.processInChunks(
      pageNumbers,
      processor,
      {
        concurrency,
        retryAttempts: 3,
        retryDelay: 2000,
        onProgress: (completed, total) => {
          this.log(`Pages processed: ${completed}/${total}`);
        }
      }
    );

    // Collect successful results
    const applications: PlanningApplication[] = [];
    let errorCount = 0;

    for (const result of results) {
      if (result.success && result.data) {
        applications.push(...result.data);
      } else {
        errorCount++;
        this.log(`Failed to process page at index ${result.index}: ${result.error?.message}`, 'warn');
      }
    }

    if (errorCount > 0) {
      this.log(`${errorCount} pages failed to process`, 'warn');
    }

    return applications;
  }
}