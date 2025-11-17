#!/usr/bin/env node

/**
 * CLI Runner for Parallel Council Scrapers
 * Execute all council scrapers in parallel with performance monitoring
 */

import { ScraperOrchestrator } from './orchestrator/ScraperOrchestrator';

async function main() {
  console.log('🚀 NW London Council Parallel Scraper');
  console.log('=====================================\n');

  // Parse command line arguments
  const args = process.argv.slice(2);
  let fromDate: Date;

  // Check for date argument
  if (args.length > 0 && args[0]) {
    const dateArg = args[0];
    fromDate = new Date(dateArg);
    if (isNaN(fromDate.getTime())) {
      console.error('❌ Invalid date format. Please use YYYY-MM-DD format.');
      console.log('Usage: npm run scrape:parallel [YYYY-MM-DD]');
      console.log('Example: npm run scrape:parallel 2024-01-01');
      process.exit(1);
    }
  } else {
    // Default to 30 days ago
    fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);
    console.log(`ℹ️  No date provided. Using default: ${fromDate.toISOString().split('T')[0]}`);
  }

  // Create orchestrator
  const orchestrator = new ScraperOrchestrator();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n⚠️  Received interrupt signal (Ctrl+C)');
    await orchestrator.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n\n⚠️  Received termination signal');
    await orchestrator.stop();
    process.exit(0);
  });

  try {
    // Run scrapers
    const stats = await orchestrator.scrapeAll(fromDate);

    // Exit with appropriate code
    if (stats.failedScrapers > 0) {
      console.log(`\n⚠️  ${stats.failedScrapers} scraper(s) failed. Check logs for details.`);
      process.exit(1);
    } else {
      console.log('\n✅ All scrapers completed successfully!');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n❌ Fatal error during scraping:', error);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});