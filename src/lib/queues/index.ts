/**
 * BullMQ Queue System Exports
 * Central export point for all queue-related functionality
 */

// Core services
export { queueService } from './services/queue.service';
export { dashboardService } from './services/dashboard.service';

// Configuration
export * from './config/queue.config';

// Workers
export { startWorkers, stopWorkers, healthCheck } from './workers';
export { startScraperWorker, stopScraperWorker } from './workers/scraper.worker';
export { startIndexerWorker, stopIndexerWorker } from './workers/indexer.worker';
export { startCacheWarmerWorker, stopCacheWarmerWorker } from './workers/cache-warmer.worker';
export { startCleanupWorker, stopCleanupWorker } from './workers/cleanup.worker';

// Types
export type { DashboardStats } from './services/dashboard.service';

// Queue-integrated orchestrator
export { queueIntegratedOrchestrator } from '@/scrapers/orchestrator/QueueIntegratedOrchestrator';