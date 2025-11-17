#!/usr/bin/env node

/**
 * Comprehensive NW London Data Scraping Runner
 * Executes all data scrapers: councils, transport, energy, crime, and amenities
 */

import { ComprehensiveOrchestrator } from './orchestrator/ComprehensiveOrchestrator';
import { connectDb, closeDb } from '@/lib/database/postgres';
import { logger } from '@/lib/logging/logger';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const options = {
    councils: !args.includes('--skip-councils'),
    transport: !args.includes('--skip-transport'),
    energy: !args.includes('--skip-energy'),
    crime: !args.includes('--skip-crime'),
    amenities: !args.includes('--skip-amenities'),
    fromDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
  };

  // Check for custom date
  const dateArg = args.find(arg => arg.startsWith('--from-date='));
  if (dateArg) {
    const dateStr = dateArg.split('=')[1];
    options.fromDate = new Date(dateStr);
  }

  // Help message
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
NW London Comprehensive Data Scraper

Usage: npm run scrape:comprehensive [options]

Options:
  --skip-councils      Skip council planning applications
  --skip-transport     Skip TfL transport data
  --skip-energy        Skip EPC energy ratings
  --skip-crime         Skip police crime statistics
  --skip-amenities     Skip local amenities
  --from-date=YYYY-MM-DD  Set start date for planning applications
  --help, -h           Show this help message

Examples:
  npm run scrape:comprehensive
  npm run scrape:comprehensive --skip-energy --skip-amenities
  npm run scrape:comprehensive --from-date=2024-01-01

Environment Variables Required:
  DATABASE_URL         PostgreSQL connection string
  TFL_API_KEY         (optional) TfL API key for enhanced access
  EPC_API_KEY         EPC Register API key
  GOOGLE_PLACES_API_KEY  Google Places API key for amenities

Coverage:
  - 10 NW London Councils: Camden, Barnet, Brent, Westminster, Harrow,
    Ealing, Hammersmith & Fulham, Kensington & Chelsea, Hillingdon, Hounslow
  - TfL Transport: Tube, Overground, DLR, Tram, Bus stations
  - Energy: EPC certificates for all properties
  - Crime: 6 months of crime statistics
  - Amenities: Restaurants, cafes, schools, healthcare facilities
`);
    process.exit(0);
  }

  try {
    // Connect to database
    logger.info('Connecting to database...');
    await connectDb();

    // Create orchestrator
    const orchestrator = new ComprehensiveOrchestrator();

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('\n\nReceived SIGINT, stopping gracefully...');
      await orchestrator.stop();
      await closeDb();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('\n\nReceived SIGTERM, stopping gracefully...');
      await orchestrator.stop();
      await closeDb();
      process.exit(0);
    });

    // Run comprehensive scraping
    logger.info('Starting comprehensive NW London data scraping...');
    const stats = await orchestrator.scrapeAllDataSources(options);

    // Summary
    logger.info('\n===========================================');
    logger.info('SCRAPING COMPLETE');
    logger.info('===========================================');
    logger.info(`Total records processed: ${stats.totalRecordsProcessed.toLocaleString()}`);
    logger.info(`Success rate: ${((stats.successfulSources / stats.totalSources) * 100).toFixed(1)}%`);
    logger.info(`Duration: ${Math.round(stats.totalDuration / 60)} minutes`);

    // Check for failures
    if (stats.failedSources > 0) {
      logger.warn(`\n⚠️  ${stats.failedSources} data source(s) failed. Check logs for details.`);
      process.exit(1);
    }

    // Success
    logger.info('\n✅ All data sources scraped successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('Fatal error during scraping:', error);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { main as runComprehensiveScraping };