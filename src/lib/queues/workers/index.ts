/**
 * Main Worker Process
 * Initializes and manages all queue workers
 */

import { queueService } from '../services/queue.service';
import { startScraperWorker, stopScraperWorker } from './scraper.worker';
import { startIndexerWorker, stopIndexerWorker } from './indexer.worker';
import { startCacheWarmerWorker, stopCacheWarmerWorker } from './cache-warmer.worker';
import { startCleanupWorker, stopCleanupWorker } from './cleanup.worker';
import { logger } from '@/lib/logging/logger';
import { connectDb, closeDb } from '@/lib/database/postgres';
import { connectRedis, closeRedis } from '@/lib/cache/redis';

let isRunning = false;
let shutdownInProgress = false;

/**
 * Start all workers
 */
export async function startWorkers(): Promise<void> {
  if (isRunning) {
    logger.warn('Workers are already running');
    return;
  }

  try {
    logger.info('Starting queue workers...');

    // Connect to services
    await connectDb();
    await connectRedis();

    // Initialize queue service
    await queueService.initialize();

    // Start workers based on environment variables
    const workers = [];

    if (process.env.ENABLE_SCRAPER_WORKER !== 'false') {
      workers.push(startScraperWorker());
    }

    if (process.env.ENABLE_INDEXER_WORKER !== 'false') {
      workers.push(startIndexerWorker());
    }

    if (process.env.ENABLE_CACHE_WARMER_WORKER !== 'false') {
      workers.push(startCacheWarmerWorker());
    }

    if (process.env.ENABLE_CLEANUP_WORKER !== 'false') {
      workers.push(startCleanupWorker());
    }

    await Promise.all(workers);

    isRunning = true;
    logger.info('✅ All queue workers started successfully');

    // Log worker status
    const stats = await queueService.getQueueStats();
    stats.forEach(stat => {
      logger.info(`Queue ${stat.name}: ${stat.waiting} waiting, ${stat.active} active`);
    });

  } catch (error) {
    logger.error('Failed to start workers:', error);
    await stopWorkers();
    throw error;
  }
}

/**
 * Stop all workers gracefully
 */
export async function stopWorkers(): Promise<void> {
  if (!isRunning || shutdownInProgress) {
    return;
  }

  shutdownInProgress = true;
  logger.info('Stopping queue workers...');

  try {
    // Stop workers
    await Promise.all([
      stopScraperWorker(),
      stopIndexerWorker(),
      stopCacheWarmerWorker(),
      stopCleanupWorker(),
    ]);

    // Shutdown queue service
    await queueService.shutdown();

    // Close connections
    await closeDb();
    await closeRedis();

    isRunning = false;
    shutdownInProgress = false;

    logger.info('✅ All queue workers stopped');
  } catch (error) {
    logger.error('Error stopping workers:', error);
    shutdownInProgress = false;
    throw error;
  }
}

/**
 * Graceful shutdown handlers
 */
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

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', async (error) => {
  logger.error('Uncaught Exception:', error);
  await stopWorkers();
  process.exit(1);
});

/**
 * Health check for workers
 */
export async function healthCheck(): Promise<{
  healthy: boolean;
  workers: {
    scraper: boolean;
    indexer: boolean;
    cacheWarmer: boolean;
    cleanup: boolean;
  };
  queues: any[];
  errors?: string[];
}> {
  const errors: string[] = [];
  let healthy = true;

  try {
    const stats = await queueService.getQueueStats();

    // Check for critical conditions
    for (const stat of stats) {
      if (stat.errorRate && stat.errorRate > 0.5) {
        errors.push(`Queue ${stat.name} has critical error rate: ${(stat.errorRate * 100).toFixed(2)}%`);
        healthy = false;
      }

      if (stat.waiting > 10000) {
        errors.push(`Queue ${stat.name} has critical backlog: ${stat.waiting} jobs`);
        healthy = false;
      }
    }

    return {
      healthy,
      workers: {
        scraper: true, // Could check actual worker status
        indexer: true,
        cacheWarmer: true,
        cleanup: true,
      },
      queues: stats,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error: any) {
    return {
      healthy: false,
      workers: {
        scraper: false,
        indexer: false,
        cacheWarmer: false,
        cleanup: false,
      },
      queues: [],
      errors: [error.message],
    };
  }
}

// Export for use in standalone worker process
export { isRunning };