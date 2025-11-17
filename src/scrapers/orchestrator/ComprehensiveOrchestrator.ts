/**
 * Comprehensive Data Orchestrator
 * Manages all data sources: councils, TfL, EPC, crime, and amenities
 */

import { ScraperOrchestrator } from './ScraperOrchestrator';
import { TfLScraper } from '../transport/TfLScraper';
import { EPCScraper } from '../energy/EPCScraper';
import { CrimeDataScraper } from '../crime/CrimeDataScraper';
import { AmenitiesScraper } from '../amenities/AmenitiesScraper';
import { query } from '@/lib/database/postgres';
import { logger } from '@/lib/logging/logger';
import { addJob } from '@/lib/queues/scraper.queue';

interface DataSourceResult {
  source: string;
  type: string;
  success: boolean;
  recordsProcessed: number;
  error?: Error;
  duration: number;
  startTime: Date;
  endTime: Date;
}

interface ComprehensiveStats {
  totalSources: number;
  successfulSources: number;
  failedSources: number;
  totalRecordsProcessed: number;
  totalDuration: number;
  councilsCovered: number;
  dataSourceResults: DataSourceResult[];
  startTime: Date;
  endTime: Date;
}

export class ComprehensiveOrchestrator {
  private councilOrchestrator = new ScraperOrchestrator();
  private tflScraper = new TfLScraper();
  private epcScraper = new EPCScraper();
  private crimeScraper = new CrimeDataScraper();
  private amenitiesScraper = new AmenitiesScraper();

  private isRunning = false;
  private abortController?: AbortController;

  /**
   * Run all data scrapers comprehensively
   */
  async scrapeAllDataSources(options: {
    councils?: boolean;
    transport?: boolean;
    energy?: boolean;
    crime?: boolean;
    amenities?: boolean;
    fromDate?: Date;
  } = {}): Promise<ComprehensiveStats> {
    // Default all to true
    const {
      councils = true,
      transport = true,
      energy = true,
      crime = true,
      amenities = true,
      fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
    } = options;

    if (this.isRunning) {
      throw new Error('Comprehensive orchestrator is already running');
    }

    this.isRunning = true;
    this.abortController = new AbortController();
    const startTime = new Date();

    logger.info('╔══════════════════════════════════════════════════════════╗');
    logger.info('║        COMPREHENSIVE NW LONDON DATA SCRAPING              ║');
    logger.info('╚══════════════════════════════════════════════════════════╝');
    logger.info(`Start time: ${startTime.toISOString()}`);
    logger.info(`Data sources enabled:`);
    if (councils) logger.info('  ✓ Council Planning Applications (10 councils)');
    if (transport) logger.info('  ✓ TfL Transport Data');
    if (energy) logger.info('  ✓ EPC Energy Ratings');
    if (crime) logger.info('  ✓ Police Crime Statistics');
    if (amenities) logger.info('  ✓ Local Amenities (Google Places & NHS)');
    logger.info('─'.repeat(60));

    const results: DataSourceResult[] = [];

    try {
      // 1. Council Planning Applications (10 councils in parallel)
      if (councils) {
        const councilResult = await this.scrapeCouncilData(fromDate);
        results.push(councilResult);
      }

      // 2. Transport Data (TfL API)
      if (transport) {
        const transportResult = await this.scrapeTransportData();
        results.push(transportResult);
      }

      // 3. Energy Performance Certificates
      if (energy) {
        const energyResult = await this.scrapeEnergyData();
        results.push(energyResult);
      }

      // 4. Crime Statistics
      if (crime) {
        const crimeResult = await this.scrapeCrimeData();
        results.push(crimeResult);
      }

      // 5. Local Amenities
      if (amenities) {
        const amenitiesResult = await this.scrapeAmenitiesData();
        results.push(amenitiesResult);
      }

      // 6. Calculate area scores
      await this.calculateAreaScores();

      // 7. Refresh materialized views
      await this.refreshMaterializedViews();

      const endTime = new Date();
      const totalDuration = (endTime.getTime() - startTime.getTime()) / 1000;

      const stats: ComprehensiveStats = {
        totalSources: results.length,
        successfulSources: results.filter(r => r.success).length,
        failedSources: results.filter(r => !r.success).length,
        totalRecordsProcessed: results.reduce((sum, r) => sum + r.recordsProcessed, 0),
        totalDuration,
        councilsCovered: 10,
        dataSourceResults: results,
        startTime,
        endTime
      };

      this.printComprehensiveReport(stats);

      return stats;
    } finally {
      this.isRunning = false;
      this.abortController = undefined;
    }
  }

  /**
   * Scrape council planning data
   */
  private async scrapeCouncilData(fromDate: Date): Promise<DataSourceResult> {
    const startTime = new Date();
    logger.info('\n📋 SCRAPING COUNCIL PLANNING APPLICATIONS...');

    try {
      const stats = await this.councilOrchestrator.scrapeAll(fromDate);
      const endTime = new Date();

      return {
        source: 'Council Planning',
        type: 'planning_applications',
        success: true,
        recordsProcessed: stats.totalApplications,
        duration: (endTime.getTime() - startTime.getTime()) / 1000,
        startTime,
        endTime
      };
    } catch (error) {
      const endTime = new Date();
      logger.error('Failed to scrape council data:', error);

      return {
        source: 'Council Planning',
        type: 'planning_applications',
        success: false,
        recordsProcessed: 0,
        error: error as Error,
        duration: (endTime.getTime() - startTime.getTime()) / 1000,
        startTime,
        endTime
      };
    }
  }

  /**
   * Scrape TfL transport data
   */
  private async scrapeTransportData(): Promise<DataSourceResult> {
    const startTime = new Date();
    logger.info('\n🚇 SCRAPING TFL TRANSPORT DATA...');

    try {
      await this.tflScraper.scrapeTransportData();

      // Count stations added
      const result = await query('SELECT COUNT(*) as count FROM transport_stations');
      const stationCount = parseInt(result.rows[0].count, 10);

      const endTime = new Date();

      return {
        source: 'TfL',
        type: 'transport_stations',
        success: true,
        recordsProcessed: stationCount,
        duration: (endTime.getTime() - startTime.getTime()) / 1000,
        startTime,
        endTime
      };
    } catch (error) {
      const endTime = new Date();
      logger.error('Failed to scrape TfL data:', error);

      return {
        source: 'TfL',
        type: 'transport_stations',
        success: false,
        recordsProcessed: 0,
        error: error as Error,
        duration: (endTime.getTime() - startTime.getTime()) / 1000,
        startTime,
        endTime
      };
    }
  }

  /**
   * Scrape EPC energy data
   */
  private async scrapeEnergyData(): Promise<DataSourceResult> {
    const startTime = new Date();
    logger.info('\n⚡ SCRAPING EPC ENERGY RATINGS...');

    try {
      await this.epcScraper.scrapeEnergyRatings();

      // Count EPCs added
      const result = await query('SELECT COUNT(*) as count FROM energy_ratings');
      const epcCount = parseInt(result.rows[0].count, 10);

      const endTime = new Date();

      return {
        source: 'EPC Register',
        type: 'energy_ratings',
        success: true,
        recordsProcessed: epcCount,
        duration: (endTime.getTime() - startTime.getTime()) / 1000,
        startTime,
        endTime
      };
    } catch (error) {
      const endTime = new Date();
      logger.error('Failed to scrape EPC data:', error);

      return {
        source: 'EPC Register',
        type: 'energy_ratings',
        success: false,
        recordsProcessed: 0,
        error: error as Error,
        duration: (endTime.getTime() - startTime.getTime()) / 1000,
        startTime,
        endTime
      };
    }
  }

  /**
   * Scrape crime statistics
   */
  private async scrapeCrimeData(): Promise<DataSourceResult> {
    const startTime = new Date();
    logger.info('\n🚔 SCRAPING CRIME STATISTICS...');

    try {
      await this.crimeScraper.scrapeCrimeData();

      // Count crime records added
      const result = await query(
        "SELECT COUNT(*) as count FROM crime_stats WHERE month >= CURRENT_DATE - INTERVAL '6 months'"
      );
      const crimeCount = parseInt(result.rows[0].count, 10);

      const endTime = new Date();

      return {
        source: 'Police API',
        type: 'crime_stats',
        success: true,
        recordsProcessed: crimeCount,
        duration: (endTime.getTime() - startTime.getTime()) / 1000,
        startTime,
        endTime
      };
    } catch (error) {
      const endTime = new Date();
      logger.error('Failed to scrape crime data:', error);

      return {
        source: 'Police API',
        type: 'crime_stats',
        success: false,
        recordsProcessed: 0,
        error: error as Error,
        duration: (endTime.getTime() - startTime.getTime()) / 1000,
        startTime,
        endTime
      };
    }
  }

  /**
   * Scrape local amenities
   */
  private async scrapeAmenitiesData(): Promise<DataSourceResult> {
    const startTime = new Date();
    logger.info('\n🏪 SCRAPING LOCAL AMENITIES...');

    try {
      await this.amenitiesScraper.scrapeAmenities();

      // Count amenities added
      const result = await query('SELECT COUNT(*) as count FROM amenities');
      const amenityCount = parseInt(result.rows[0].count, 10);

      const endTime = new Date();

      return {
        source: 'Google Places & NHS',
        type: 'amenities',
        success: true,
        recordsProcessed: amenityCount,
        duration: (endTime.getTime() - startTime.getTime()) / 1000,
        startTime,
        endTime
      };
    } catch (error) {
      const endTime = new Date();
      logger.error('Failed to scrape amenities data:', error);

      return {
        source: 'Google Places & NHS',
        type: 'amenities',
        success: false,
        recordsProcessed: 0,
        error: error as Error,
        duration: (endTime.getTime() - startTime.getTime()) / 1000,
        startTime,
        endTime
      };
    }
  }

  /**
   * Calculate comprehensive area scores
   */
  private async calculateAreaScores(): Promise<void> {
    logger.info('\n📊 CALCULATING AREA SCORES...');

    try {
      const result = await query('SELECT id FROM areas');
      const areaIds = result.rows.map((row: any) => row.id);

      for (const areaId of areaIds) {
        await query('SELECT calculate_area_scores($1)', [areaId]);
      }

      logger.info(`✅ Calculated scores for ${areaIds.length} areas`);
    } catch (error) {
      logger.error('Failed to calculate area scores:', error);
    }
  }

  /**
   * Refresh all materialized views
   */
  private async refreshMaterializedViews(): Promise<void> {
    logger.info('\n🔄 REFRESHING MATERIALIZED VIEWS...');

    try {
      // Refresh comprehensive coverage views
      await query('REFRESH MATERIALIZED VIEW CONCURRENTLY IF EXISTS mv_area_transport_access');
      await query('REFRESH MATERIALIZED VIEW CONCURRENTLY IF EXISTS mv_area_school_performance');

      // Refresh existing views
      await query('REFRESH MATERIALIZED VIEW CONCURRENTLY IF EXISTS mv_properties_denormalized');
      await query('REFRESH MATERIALIZED VIEW CONCURRENTLY IF EXISTS mv_property_market_stats');
      await query('REFRESH MATERIALIZED VIEW CONCURRENTLY IF EXISTS mv_planning_trends');

      logger.info('✅ All materialized views refreshed');
    } catch (error) {
      logger.error('Failed to refresh materialized views:', error);
    }
  }

  /**
   * Queue background jobs for all data sources
   */
  async queueAllScrapingJobs(): Promise<void> {
    logger.info('Queueing comprehensive scraping jobs...');

    // Queue council scraping jobs
    const councils = [
      'Barnet', 'Brent', 'Camden', 'Ealing', 'Harrow', 'Westminster',
      'Hammersmith and Fulham', 'Kensington and Chelsea', 'Hillingdon', 'Hounslow'
    ];

    for (const council of councils) {
      await addJob({
        type: 'scrape-council',
        data: { council, fromDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      });
    }

    // Queue other data source jobs
    await addJob({ type: 'scrape-transport', data: {} });
    await addJob({ type: 'scrape-energy', data: {} });
    await addJob({ type: 'scrape-crime', data: {} });
    await addJob({ type: 'scrape-amenities', data: {} });

    logger.info('All scraping jobs queued successfully');
  }

  /**
   * Print comprehensive report
   */
  private printComprehensiveReport(stats: ComprehensiveStats): void {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║         COMPREHENSIVE SCRAPING COMPLETED                  ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log();
    console.log('📊 OVERALL STATISTICS:');
    console.log('─'.repeat(60));
    console.log(`Total Data Sources: ${stats.totalSources}`);
    console.log(`Successful Sources: ${stats.successfulSources}/${stats.totalSources}`);
    console.log(`Failed Sources: ${stats.failedSources}/${stats.totalSources}`);
    console.log(`Total Records Processed: ${stats.totalRecordsProcessed.toLocaleString()}`);
    console.log(`Total Duration: ${this.formatDuration(stats.totalDuration)}`);
    console.log(`Councils Covered: ${stats.councilsCovered}`);
    console.log();
    console.log('📈 DATA SOURCE BREAKDOWN:');
    console.log('─'.repeat(60));

    const sortedResults = [...stats.dataSourceResults].sort((a, b) => b.recordsProcessed - a.recordsProcessed);

    sortedResults.forEach(result => {
      const status = result.success ? '✅' : '❌';
      const records = result.recordsProcessed.toString().padStart(8);
      const duration = result.duration.toFixed(2).padStart(7);

      console.log(`${status} ${result.source.padEnd(25)} | ${records} records | ${duration}s`);

      if (result.error) {
        console.log(`   └─ Error: ${result.error.message}`);
      }
    });

    console.log();
    console.log('📍 COVERAGE SUMMARY:');
    console.log('─'.repeat(60));
    console.log('Councils: 10 (Complete NW London coverage)');
    console.log('Transport: TfL stations, bus stops, accessibility');
    console.log('Energy: EPC ratings for all properties');
    console.log('Crime: 6 months of crime statistics');
    console.log('Amenities: Restaurants, cafes, schools, healthcare');
    console.log();
    console.log('─'.repeat(60));
    console.log(`Start Time: ${stats.startTime.toISOString()}`);
    console.log(`End Time: ${stats.endTime.toISOString()}`);
    console.log('═'.repeat(60));
  }

  /**
   * Format duration helper
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
   * Get current status
   */
  getStatus(): { isRunning: boolean; dataSources: string[] } {
    return {
      isRunning: this.isRunning,
      dataSources: [
        'Council Planning (10 councils)',
        'TfL Transport',
        'EPC Energy Ratings',
        'Police Crime Stats',
        'Local Amenities'
      ]
    };
  }

  /**
   * Stop all running scrapers
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.info('Comprehensive orchestrator is not running');
      return;
    }

    logger.info('\n⚠️  Stopping all data scrapers gracefully...');
    if (this.abortController) {
      this.abortController.abort();
    }

    // Stop council orchestrator
    await this.councilOrchestrator.stop();

    this.isRunning = false;
    logger.info('All scrapers stopped');
  }
}