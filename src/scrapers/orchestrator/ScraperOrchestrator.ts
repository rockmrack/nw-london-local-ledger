/**
 * Master Scraper Orchestrator
 * Manages parallel execution of all council scrapers with consolidated reporting
 */

import { ParallelBarnetScraper } from '../councils/barnet/ParallelBarnetScraper';
import { ParallelBrentScraper } from '../councils/brent/ParallelBrentScraper';
import { ParallelCamdenScraper } from '../councils/camden/ParallelCamdenScraper';
import { ParallelEalingScraper } from '../councils/ealing/ParallelEalingScraper';
import { ParallelHarrowScraper } from '../councils/harrow/ParallelHarrowScraper';
import { ParallelWestminsterScraper } from '../councils/westminster/ParallelWestminsterScraper';
import { ParallelHammersmithScraper } from '../councils/hammersmith/ParallelHammersmithScraper';
import { ParallelKensingtonScraper } from '../councils/kensington/ParallelKensingtonScraper';
import { ParallelHillingdonScraper } from '../councils/hillingdon/ParallelHillingdonScraper';
import { ParallelHounslowScraper } from '../councils/hounslow/ParallelHounslowScraper';
import type { PlanningApplication } from '@/types/planning';

interface ScraperResult {
  council: string;
  success: boolean;
  applications: PlanningApplication[];
  error?: Error;
  duration: number;
  startTime: Date;
  endTime: Date;
}

interface OrchestratorStats {
  totalApplications: number;
  successfulScrapers: number;
  failedScrapers: number;
  totalDuration: number;
  councilStats: ScraperResult[];
  startTime: Date;
  endTime: Date;
}

export class ScraperOrchestrator {
  private scrapers = [
    { name: 'Barnet', scraper: new ParallelBarnetScraper() },
    { name: 'Brent', scraper: new ParallelBrentScraper() },
    { name: 'Camden', scraper: new ParallelCamdenScraper() },
    { name: 'Ealing', scraper: new ParallelEalingScraper() },
    { name: 'Harrow', scraper: new ParallelHarrowScraper() },
    { name: 'Westminster', scraper: new ParallelWestminsterScraper() },
    { name: 'Hammersmith & Fulham', scraper: new ParallelHammersmithScraper() },
    { name: 'Kensington & Chelsea', scraper: new ParallelKensingtonScraper() },
    { name: 'Hillingdon', scraper: new ParallelHillingdonScraper() },
    { name: 'Hounslow', scraper: new ParallelHounslowScraper() }
  ];

  private abortController?: AbortController;
  private isRunning = false;

  /**
   * Run all scrapers in parallel
   */
  async scrapeAll(fromDate: Date): Promise<OrchestratorStats> {
    if (this.isRunning) {
      throw new Error('Orchestrator is already running');
    }

    this.isRunning = true;
    this.abortController = new AbortController();
    const startTime = new Date();

    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║           PARALLEL COUNCIL SCRAPING INITIATED           ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`Start time: ${startTime.toISOString()}`);
    console.log(`Scraping from: ${fromDate.toISOString()}`);
    console.log(`Councils: ${this.scrapers.map(s => s.name).join(', ')}`);
    console.log('─'.repeat(60));

    try {
      // Run all scrapers in parallel
      const scraperPromises = this.scrapers.map(({ name, scraper }) =>
        this.runScraper(name, scraper, fromDate)
      );

      const results = await Promise.allSettled(scraperPromises);

      // Process results
      const councilStats: ScraperResult[] = results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          const { name } = this.scrapers[index];
          return {
            council: name,
            success: false,
            applications: [],
            error: result.reason,
            duration: 0,
            startTime,
            endTime: new Date()
          };
        }
      });

      const endTime = new Date();
      const totalDuration = (endTime.getTime() - startTime.getTime()) / 1000;

      // Calculate statistics
      const stats: OrchestratorStats = {
        totalApplications: councilStats.reduce((sum, stat) => sum + stat.applications.length, 0),
        successfulScrapers: councilStats.filter(s => s.success).length,
        failedScrapers: councilStats.filter(s => !s.success).length,
        totalDuration,
        councilStats,
        startTime,
        endTime
      };

      this.printFinalReport(stats);

      return stats;
    } finally {
      this.isRunning = false;
      this.abortController = undefined;
    }
  }

  /**
   * Run a single scraper with error handling
   */
  private async runScraper(
    councilName: string,
    scraper: any,
    fromDate: Date
  ): Promise<ScraperResult> {
    const startTime = new Date();
    console.log(`[${councilName}] Starting parallel scrape...`);

    try {
      const applications = await scraper.scrapePlanningApplications(fromDate);
      const endTime = new Date();
      const duration = (endTime.getTime() - startTime.getTime()) / 1000;

      console.log(`[${councilName}] ✅ Completed - ${applications.length} applications in ${duration.toFixed(2)}s`);

      return {
        council: councilName,
        success: true,
        applications,
        duration,
        startTime,
        endTime
      };
    } catch (error) {
      const endTime = new Date();
      const duration = (endTime.getTime() - startTime.getTime()) / 1000;

      console.error(`[${councilName}] ❌ Failed after ${duration.toFixed(2)}s:`, error);

      return {
        council: councilName,
        success: false,
        applications: [],
        error: error as Error,
        duration,
        startTime,
        endTime
      };
    }
  }

  /**
   * Print final consolidated report
   */
  private printFinalReport(stats: OrchestratorStats): void {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║              PARALLEL SCRAPING COMPLETED                ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log();
    console.log('📊 OVERALL STATISTICS:');
    console.log('─'.repeat(60));
    console.log(`Total Applications: ${stats.totalApplications}`);
    console.log(`Successful Scrapers: ${stats.successfulScrapers}/${this.scrapers.length}`);
    console.log(`Failed Scrapers: ${stats.failedScrapers}/${this.scrapers.length}`);
    console.log(`Total Duration: ${this.formatDuration(stats.totalDuration)}`);
    console.log(`Average Speed: ${(stats.totalApplications / stats.totalDuration).toFixed(2)} applications/sec`);
    console.log();
    console.log('📈 COUNCIL BREAKDOWN:');
    console.log('─'.repeat(60));

    // Sort by application count (descending)
    const sortedStats = [...stats.councilStats].sort((a, b) => b.applications.length - a.applications.length);

    sortedStats.forEach(stat => {
      const status = stat.success ? '✅' : '❌';
      const appCount = stat.applications.length.toString().padStart(4);
      const duration = stat.duration.toFixed(2).padStart(7);
      const speed = stat.duration > 0
        ? `${(stat.applications.length / stat.duration).toFixed(2)} apps/s`
        : 'N/A';

      console.log(`${status} ${stat.council.padEnd(12)} | ${appCount} apps | ${duration}s | ${speed}`);

      if (stat.error) {
        console.log(`   └─ Error: ${stat.error.message}`);
      }
    });

    console.log();
    console.log('─'.repeat(60));
    console.log(`Start Time: ${stats.startTime.toISOString()}`);
    console.log(`End Time: ${stats.endTime.toISOString()}`);
    console.log('═'.repeat(60));
  }

  /**
   * Format duration in seconds to human-readable format
   */
  private formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${seconds.toFixed(2)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = (seconds % 60).toFixed(0);
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }

  /**
   * Stop all running scrapers gracefully
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('Orchestrator is not running');
      return;
    }

    console.log('\n⚠️  Stopping all scrapers gracefully...');
    if (this.abortController) {
      this.abortController.abort();
    }
    this.isRunning = false;
  }

  /**
   * Get current status
   */
  getStatus(): { isRunning: boolean; scrapers: string[] } {
    return {
      isRunning: this.isRunning,
      scrapers: this.scrapers.map(s => s.name)
    };
  }
}