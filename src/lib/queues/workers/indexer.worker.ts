/**
 * Indexer Queue Worker
 * Processes bulk Elasticsearch indexing operations
 */

import { Worker, Job } from 'bullmq';
import { REDIS_CONFIG, getQueueConfig } from '../config/queue.config';
import { queueService } from '../services/queue.service';
import { logger } from '@/lib/logging/logger';
import { searchService } from '@/lib/search/elasticsearch';
import { connectDb, query } from '@/lib/database/postgres';

interface IndexerJobData {
  type: 'property' | 'planning' | 'area' | 'news';
  operation: 'index' | 'reindex' | 'delete' | 'bulk';
  ids?: number[]; // Specific IDs to index
  council?: string; // For planning applications
  batchSize?: number;
  source?: string; // Where the job came from
  forceReindex?: boolean;
}

interface IndexerJobResult {
  type: string;
  operation: string;
  processed: number;
  success: number;
  failed: number;
  duration: number;
  errors?: string[];
}

class IndexerWorker {
  private worker: Worker<IndexerJobData, IndexerJobResult>;
  private readonly DEFAULT_BATCH_SIZE = 1000;

  constructor() {
    const config = getQueueConfig('indexer-queue');

    this.worker = new Worker<IndexerJobData, IndexerJobResult>(
      'indexer-queue',
      async (job: Job<IndexerJobData>) => await this.process(job),
      {
        ...config.workerOptions,
        connection: REDIS_CONFIG.connection,
      }
    );

    this.setupEventHandlers();

    // Register worker with queue service
    queueService.registerWorker('indexer-queue', this.worker);
  }

  /**
   * Process an indexing job
   */
  private async process(job: Job<IndexerJobData>): Promise<IndexerJobResult> {
    const startTime = Date.now();
    const { type, operation, ids, council, batchSize, forceReindex } = job.data;

    logger.info(`[Indexer Worker] Processing job ${job.id}`, {
      type,
      operation,
      idsCount: ids?.length,
      council,
    });

    await job.updateProgress(0);

    try {
      // Connect to database
      await connectDb();

      let result: IndexerJobResult;

      switch (operation) {
        case 'index':
          result = await this.indexDocuments(job, type, ids, council, batchSize || this.DEFAULT_BATCH_SIZE);
          break;

        case 'reindex':
          result = await this.reindexType(job, type, forceReindex, batchSize || this.DEFAULT_BATCH_SIZE);
          break;

        case 'bulk':
          result = await this.bulkIndex(job, type, ids, batchSize || this.DEFAULT_BATCH_SIZE);
          break;

        case 'delete':
          result = await this.deleteDocuments(job, type, ids);
          break;

        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      const duration = Date.now() - startTime;
      result.duration = duration;

      logger.info(`[Indexer Worker] Job ${job.id} completed`, result);

      await job.updateProgress(100);
      return result;
    } catch (error) {
      logger.error(`[Indexer Worker] Job ${job.id} failed:`, error);
      throw error;
    }
  }

  /**
   * Index specific documents
   */
  private async indexDocuments(
    job: Job<IndexerJobData>,
    type: string,
    ids?: number[],
    council?: string,
    batchSize: number = this.DEFAULT_BATCH_SIZE
  ): Promise<IndexerJobResult> {
    const documents = await this.fetchDocuments(type, ids, council);
    const total = documents.length;

    logger.info(`[Indexer Worker] Indexing ${total} ${type} documents`);

    let processed = 0;
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    // Process in batches
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);

      try {
        const result = await searchService.bulkIndex(type as any, batch);
        success += result.success;
        failed += result.failed;
      } catch (error: any) {
        logger.error(`[Indexer Worker] Batch indexing failed:`, error);
        errors.push(`Batch ${i}-${i + batch.length}: ${error.message}`);
        failed += batch.length;
      }

      processed += batch.length;

      // Update progress
      const progress = Math.round((processed / total) * 100);
      await job.updateProgress(progress);

      logger.debug(`[Indexer Worker] Progress: ${processed}/${total} (${progress}%)`);
    }

    return {
      type,
      operation: 'index',
      processed,
      success,
      failed,
      duration: 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Reindex all documents of a type
   */
  private async reindexType(
    job: Job<IndexerJobData>,
    type: string,
    forceReindex?: boolean,
    batchSize: number = this.DEFAULT_BATCH_SIZE
  ): Promise<IndexerJobResult> {
    logger.info(`[Indexer Worker] Reindexing all ${type} documents`);

    // Fetch all documents of this type
    const documents = await this.fetchAllDocuments(type);
    const total = documents.length;

    logger.info(`[Indexer Worker] Found ${total} ${type} documents to reindex`);

    let processed = 0;
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    // Process in batches
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);

      try {
        const result = await searchService.bulkIndex(type as any, batch);
        success += result.success;
        failed += result.failed;
      } catch (error: any) {
        logger.error(`[Indexer Worker] Batch reindexing failed:`, error);
        errors.push(`Batch ${i}-${i + batch.length}: ${error.message}`);
        failed += batch.length;
      }

      processed += batch.length;

      // Update progress
      const progress = Math.round((processed / total) * 100);
      await job.updateProgress(progress);

      // Add small delay to prevent overwhelming the system
      if (i % (batchSize * 10) === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return {
      type,
      operation: 'reindex',
      processed,
      success,
      failed,
      duration: 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Bulk index documents
   */
  private async bulkIndex(
    job: Job<IndexerJobData>,
    type: string,
    ids?: number[],
    batchSize: number = this.DEFAULT_BATCH_SIZE
  ): Promise<IndexerJobResult> {
    const documents = await this.fetchDocuments(type, ids);

    logger.info(`[Indexer Worker] Bulk indexing ${documents.length} ${type} documents`);

    const result = await searchService.bulkIndexWithProgress(
      type as any,
      documents,
      async (current, total) => {
        const progress = Math.round((current / total) * 100);
        await job.updateProgress(progress);
      }
    );

    return {
      type,
      operation: 'bulk',
      processed: documents.length,
      success: result.success,
      failed: result.failed,
      duration: 0,
    };
  }

  /**
   * Delete documents from index
   */
  private async deleteDocuments(
    job: Job<IndexerJobData>,
    type: string,
    ids?: number[]
  ): Promise<IndexerJobResult> {
    if (!ids || ids.length === 0) {
      throw new Error('No IDs provided for deletion');
    }

    logger.info(`[Indexer Worker] Deleting ${ids.length} ${type} documents`);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const id of ids) {
      try {
        // Delete from Elasticsearch
        await searchService.deleteDocument(type, id.toString());
        success++;
      } catch (error: any) {
        logger.error(`[Indexer Worker] Failed to delete document ${id}:`, error);
        errors.push(`ID ${id}: ${error.message}`);
        failed++;
      }

      // Update progress
      const progress = Math.round(((success + failed) / ids.length) * 100);
      await job.updateProgress(progress);
    }

    return {
      type,
      operation: 'delete',
      processed: ids.length,
      success,
      failed,
      duration: 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Fetch documents from database
   */
  private async fetchDocuments(type: string, ids?: number[], council?: string): Promise<any[]> {
    let sql: string;
    let params: any[] = [];

    switch (type) {
      case 'property':
        sql = ids
          ? 'SELECT * FROM properties WHERE id = ANY($1)'
          : 'SELECT * FROM properties WHERE updated_at > NOW() - INTERVAL \'7 days\'';
        if (ids) params = [ids];
        break;

      case 'planning':
        if (ids) {
          sql = 'SELECT * FROM planning_applications WHERE id = ANY($1)';
          params = [ids];
        } else if (council) {
          sql = 'SELECT * FROM planning_applications WHERE council = $1 AND updated_at > NOW() - INTERVAL \'7 days\'';
          params = [council];
        } else {
          sql = 'SELECT * FROM planning_applications WHERE updated_at > NOW() - INTERVAL \'7 days\'';
        }
        break;

      case 'area':
        sql = ids
          ? 'SELECT * FROM areas WHERE id = ANY($1)'
          : 'SELECT * FROM areas';
        if (ids) params = [ids];
        break;

      case 'news':
        sql = ids
          ? 'SELECT * FROM news_articles WHERE id = ANY($1)'
          : 'SELECT * FROM news_articles WHERE published_at > NOW() - INTERVAL \'30 days\'';
        if (ids) params = [ids];
        break;

      default:
        throw new Error(`Unknown document type: ${type}`);
    }

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Fetch all documents of a type for reindexing
   */
  private async fetchAllDocuments(type: string): Promise<any[]> {
    const tables: Record<string, string> = {
      property: 'properties',
      planning: 'planning_applications',
      area: 'areas',
      news: 'news_articles',
    };

    const table = tables[type];
    if (!table) {
      throw new Error(`Unknown document type: ${type}`);
    }

    const result = await query(`SELECT * FROM ${table} ORDER BY id`);
    return result.rows;
  }

  /**
   * Setup event handlers for the worker
   */
  private setupEventHandlers(): void {
    this.worker.on('completed', (job: Job<IndexerJobData>, result: IndexerJobResult) => {
      logger.info(`[Indexer Worker] Job ${job.id} completed successfully`, {
        type: job.data.type,
        operation: job.data.operation,
        processed: result.processed,
        success: result.success,
        failed: result.failed,
        duration: result.duration,
      });
    });

    this.worker.on('failed', (job: Job<IndexerJobData> | undefined, error: Error) => {
      if (job) {
        logger.error(`[Indexer Worker] Job ${job.id} failed:`, {
          type: job.data.type,
          operation: job.data.operation,
          error: error.message,
          stack: error.stack,
        });
      }
    });

    this.worker.on('error', (error: Error) => {
      logger.error('[Indexer Worker] Worker error:', error);
    });

    this.worker.on('progress', (job: Job<IndexerJobData>, progress: number | object) => {
      logger.debug(`[Indexer Worker] Job ${job.id} progress:`, progress);
    });
  }

  /**
   * Gracefully shutdown the worker
   */
  public async shutdown(): Promise<void> {
    logger.info('[Indexer Worker] Shutting down...');
    await this.worker.close();
    logger.info('[Indexer Worker] Shutdown complete');
  }
}

// Extend SearchService with delete method (if not exists)
declare module '@/lib/search/elasticsearch' {
  interface SearchService {
    deleteDocument(type: string, id: string): Promise<void>;
  }
}

// Add deleteDocument method to SearchService if not exists
if (!searchService.deleteDocument) {
  searchService.deleteDocument = async function(type: string, id: string): Promise<void> {
    try {
      const { Client } = await import('@elastic/elasticsearch');
      const esClient = new Client({
        node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
      });

      await esClient.delete({
        index: `${type}s`,
        id: id,
      });
    } catch (error) {
      logger.error(`Error deleting document ${id} from ${type} index:`, error);
      throw error;
    }
  };
}

// Export worker instance
let indexerWorker: IndexerWorker | null = null;

export async function startIndexerWorker(): Promise<IndexerWorker> {
  if (!indexerWorker) {
    indexerWorker = new IndexerWorker();
  }
  return indexerWorker;
}

export async function stopIndexerWorker(): Promise<void> {
  if (indexerWorker) {
    await indexerWorker.shutdown();
    indexerWorker = null;
  }
}