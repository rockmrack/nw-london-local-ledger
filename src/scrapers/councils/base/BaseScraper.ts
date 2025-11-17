/**
 * Base class for all council scrapers
 * Provides common functionality and interface
 */

import { RateLimiter } from '../../utils/rate-limiter';
import { retryWithBackoff, handleScraperError, NetworkError } from '../../utils/error-handler';
import type { Council, PlanningApplication } from '@/types/planning';

export interface ScraperConfig {
  council: Council;
  baseUrl: string;
  rateLimit: number; // requests per second
  maxRetries: number;
  timeout: number; // milliseconds
  userAgent: string;
}

export abstract class BaseScraper {
  protected rateLimiter: RateLimiter;
  protected config: ScraperConfig;

  constructor(config: ScraperConfig) {
    this.config = config;
    this.rateLimiter = new RateLimiter(config.rateLimit);
  }

  /**
   * Scrape planning applications from a specific date onwards
   */
  abstract scrapePlanningApplications(fromDate: Date): Promise<PlanningApplication[]>;

  /**
   * Scrape details for a specific planning application
   */
  abstract scrapePlanningDetails(reference: string): Promise<PlanningApplication | null>;

  /**
   * Make an HTTP request with rate limiting and retries
   */
  protected async fetch(url: string, options?: RequestInit): Promise<Response> {
    await this.rateLimiter.acquire();

    return retryWithBackoff(async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            'User-Agent': this.config.userAgent,
            ...options?.headers,
          },
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
      } catch (error) {
        throw new NetworkError(this.config.council, error as Error);
      }
    }, this.config.maxRetries);
  }

  /**
   * Parse HTML response
   */
  protected async parseHTML(url: string): Promise<any> {
    const response = await this.fetch(url);
    const html = await response.text();

    // You would use cheerio or similar to parse HTML
    // For now, just return the raw HTML
    return html;
  }

  /**
   * Log scraper activity
   */
  protected log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    const prefix = `[${this.config.council} Scraper]`;

    switch (level) {
      case 'info':
        console.log(`${prefix} ${message}`);
        break;
      case 'warn':
        console.warn(`${prefix} ${message}`);
        break;
      case 'error':
        console.error(`${prefix} ${message}`);
        break;
    }
  }

  /**
   * Handle errors consistently
   */
  protected handleError(error: unknown): void {
    handleScraperError(error, this.config.council);
  }

  /**
   * Validate scraper configuration
   */
  protected validateConfig(): boolean {
    if (!this.config.baseUrl) {
      console.error(`${this.config.council}: Base URL not configured`);
      return false;
    }

    if (this.config.rateLimit <= 0) {
      console.error(`${this.config.council}: Invalid rate limit`);
      return false;
    }

    return true;
  }
}
