/**
 * Example usage of parallel council scrapers
 * Demonstrates various ways to use the parallel scraping system
 */

import { ScraperOrchestrator } from '../orchestrator/ScraperOrchestrator';
import { ParallelBarnetScraper } from '../councils/barnet/ParallelBarnetScraper';
import { ParallelProcessor } from '../utils/parallel-processor';
import type { PlanningApplication } from '@/types/planning';

/**
 * Example 1: Run all scrapers in parallel using the orchestrator
 */
async function runAllScrapersInParallel() {
  console.log('Example 1: Running all scrapers in parallel');
  console.log('='.repeat(50));

  const orchestrator = new ScraperOrchestrator();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 30); // Last 30 days

  try {
    const stats = await orchestrator.scrapeAll(fromDate);

    console.log(`\nResults:`);
    console.log(`Total applications scraped: ${stats.totalApplications}`);
    console.log(`Time taken: ${stats.totalDuration.toFixed(2)} seconds`);
    console.log(`Success rate: ${stats.successfulScrapers}/${stats.councilStats.length}`);

    // Process the results
    for (const councilStat of stats.councilStats) {
      if (councilStat.success) {
        console.log(`${councilStat.council}: ${councilStat.applications.length} applications`);
        // Here you would typically save to database
        // await saveToDatabase(councilStat.applications);
      }
    }
  } catch (error) {
    console.error('Failed to run scrapers:', error);
  }
}

/**
 * Example 2: Run a single council scraper with parallel page processing
 */
async function runSingleScraperWithParallelPages() {
  console.log('\nExample 2: Running single scraper with parallel pages');
  console.log('='.repeat(50));

  const barnetScraper = new ParallelBarnetScraper();
  const fromDate = new Date();
  fromDate.setMonth(fromDate.getMonth() - 1); // Last month

  try {
    const applications = await barnetScraper.scrapePlanningApplications(fromDate);
    console.log(`Scraped ${applications.length} applications from Barnet`);

    // Process applications
    applications.forEach(app => {
      console.log(`- ${app.reference}: ${app.address}`);
    });
  } catch (error) {
    console.error('Failed to scrape Barnet:', error);
  }
}

/**
 * Example 3: Scrape details for multiple applications in parallel
 */
async function scrapeMultipleDetailsInParallel() {
  console.log('\nExample 3: Scraping multiple application details in parallel');
  console.log('='.repeat(50));

  const barnetScraper = new ParallelBarnetScraper();

  // Example reference numbers (you would get these from a previous scrape)
  const references = [
    '24/0001/FUL',
    '24/0002/HSE',
    '24/0003/PNE',
    '24/0004/FUL',
    '24/0005/LBC'
  ];

  try {
    const applications = await barnetScraper.scrapePlanningDetailsParallel(references);
    console.log(`Successfully scraped ${applications.length} application details`);

    applications.forEach(app => {
      console.log(`\nApplication: ${app.reference}`);
      console.log(`Address: ${app.address}`);
      console.log(`Proposal: ${app.proposal}`);
      console.log(`Status: ${app.status}`);
    });
  } catch (error) {
    console.error('Failed to scrape details:', error);
  }
}

/**
 * Example 4: Custom parallel processing with error recovery
 */
async function customParallelProcessing() {
  console.log('\nExample 4: Custom parallel processing with error recovery');
  console.log('='.repeat(50));

  // Simulate processing multiple councils with custom logic
  const councils = ['Barnet', 'Brent', 'Camden', 'Ealing', 'Harrow', 'Westminster'];

  const results = await ParallelProcessor.processInChunks(
    councils,
    async (council, index) => {
      console.log(`Processing ${council} (${index + 1}/${councils.length})`);

      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, Math.random() * 2000));

      // Randomly simulate failures for demonstration
      if (Math.random() > 0.8) {
        throw new Error(`Simulated failure for ${council}`);
      }

      return {
        council,
        applicationCount: Math.floor(Math.random() * 100),
        processingTime: Date.now()
      };
    },
    {
      concurrency: 3, // Process 3 councils at a time
      retryAttempts: 2,
      retryDelay: 1000,
      onProgress: (completed, total) => {
        const percentage = ((completed / total) * 100).toFixed(0);
        console.log(`Progress: ${completed}/${total} (${percentage}%)`);
      }
    }
  );

  // Analyze results
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\nProcessing complete:`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);

  successful.forEach(result => {
    if (result.data) {
      console.log(`- ${result.data.council}: ${result.data.applicationCount} applications`);
    }
  });

  if (failed.length > 0) {
    console.log('\nFailed councils:');
    failed.forEach(result => {
      console.log(`- Index ${result.index}: ${result.error?.message}`);
    });
  }
}

/**
 * Example 5: Graceful shutdown handling
 */
async function scrapingWithGracefulShutdown() {
  console.log('\nExample 5: Scraping with graceful shutdown');
  console.log('='.repeat(50));

  const orchestrator = new ScraperOrchestrator();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 7); // Last week

  // Set up shutdown handlers
  const shutdownHandler = async () => {
    console.log('\nReceived shutdown signal, stopping scrapers gracefully...');
    await orchestrator.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdownHandler);
  process.on('SIGTERM', shutdownHandler);

  try {
    console.log('Starting scrapers (press Ctrl+C to stop)...');
    const stats = await orchestrator.scrapeAll(fromDate);
    console.log('Scraping completed successfully');
  } catch (error) {
    if (error instanceof Error && error.message.includes('abort')) {
      console.log('Scraping was aborted');
    } else {
      console.error('Scraping failed:', error);
    }
  }
}

/**
 * Main function to run all examples
 */
async function main() {
  console.log('🚀 Parallel Scraping Examples');
  console.log('=' * 60);

  // Uncomment the example you want to run:

  // await runAllScrapersInParallel();
  // await runSingleScraperWithParallelPages();
  // await scrapeMultipleDetailsInParallel();
  // await customParallelProcessing();
  // await scrapingWithGracefulShutdown();

  // Or run all examples sequentially:
  await runAllScrapersInParallel();
  await runSingleScraperWithParallelPages();
  await scrapeMultipleDetailsInParallel();
  await customParallelProcessing();

  console.log('\n✅ All examples completed!');
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export {
  runAllScrapersInParallel,
  runSingleScraperWithParallelPages,
  scrapeMultipleDetailsInParallel,
  customParallelProcessing,
  scrapingWithGracefulShutdown
};