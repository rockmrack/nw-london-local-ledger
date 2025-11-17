#!/usr/bin/env node

/**
 * Standalone Queue Worker Process
 * Run with: npm run worker:start
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { startWorkers, stopWorkers } from '@/lib/queues/workers';
import { logger } from '@/lib/logging/logger';

// Worker configuration from environment
const config = {
  scraperEnabled: process.env.ENABLE_SCRAPER_WORKER !== 'false',
  indexerEnabled: process.env.ENABLE_INDEXER_WORKER !== 'false',
  cacheWarmerEnabled: process.env.ENABLE_CACHE_WARMER_WORKER !== 'false',
  cleanupEnabled: process.env.ENABLE_CLEANUP_WORKER !== 'false',
};

async function main() {
  logger.info('Starting Queue Worker Process...');
  logger.info('Configuration:', config);

  try {
    // Start all workers
    await startWorkers();

    logger.info('Queue Worker Process is running');
    logger.info('Press Ctrl+C to stop');

    // Keep the process alive
    setInterval(() => {
      // Health check every 30 seconds
      logger.debug('Worker process heartbeat');
    }, 30000);

  } catch (error) {
    logger.error('Failed to start Queue Worker Process:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await stopWorkers();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await stopWorkers();
  process.exit(0);
});

// Start the worker process
main().catch((error) => {
  logger.error('Unhandled error in main:', error);
  process.exit(1);
});