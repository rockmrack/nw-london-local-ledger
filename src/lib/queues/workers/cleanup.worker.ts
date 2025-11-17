/**
 * Cleanup Queue Worker
 * Handles maintenance tasks like cleaning old data and refreshing materialized views
 */

import { Worker, Job } from 'bullmq';
import { REDIS_CONFIG, getQueueConfig } from '../config/queue.config';
import { queueService } from '../services/queue.service';
import { logger } from '@/lib/logging/logger';
import { connectDb, query } from '@/lib/database/postgres';
import { deleteCacheByPattern } from '@/lib/cache/redis';

interface CleanupJobData {
  task: 'refresh-views' | 'cleanup-old-data' | 'optimize-db' | 'vacuum' | 'reindex' | 'custom';
  target?: string; // Specific target for the task
  options?: {
    daysToKeep?: number;
    forceVacuum?: boolean;
    analyzeAfter?: boolean;
    tables?: string[];
  };
}

interface CleanupJobResult {
  task: string;
  success: boolean;
  itemsProcessed?: number;
  itemsDeleted?: number;
  duration: number;
  details?: any;
  errors?: string[];
}

class CleanupWorker {
  private worker: Worker<CleanupJobData, CleanupJobResult>;
  private readonly DEFAULT_DAYS_TO_KEEP = 90; // Keep data for 90 days by default

  constructor() {
    const config = getQueueConfig('cleanup-queue');

    this.worker = new Worker<CleanupJobData, CleanupJobResult>(
      'cleanup-queue',
      async (job: Job<CleanupJobData>) => await this.process(job),
      {
        ...config.workerOptions,
        connection: REDIS_CONFIG.connection,
      }
    );

    this.setupEventHandlers();

    // Register worker with queue service
    queueService.registerWorker('cleanup-queue', this.worker);
  }

  /**
   * Process a cleanup job
   */
  private async process(job: Job<CleanupJobData>): Promise<CleanupJobResult> {
    const startTime = Date.now();
    const { task, target, options } = job.data;

    logger.info(`[Cleanup Worker] Processing job ${job.id}`, {
      task,
      target,
      options,
    });

    await job.updateProgress(0);

    try {
      // Connect to database
      await connectDb();

      let result: CleanupJobResult;

      switch (task) {
        case 'refresh-views':
          result = await this.refreshMaterializedViews(job, target);
          break;

        case 'cleanup-old-data':
          result = await this.cleanupOldData(job, options?.daysToKeep || this.DEFAULT_DAYS_TO_KEEP);
          break;

        case 'optimize-db':
          result = await this.optimizeDatabase(job, options);
          break;

        case 'vacuum':
          result = await this.vacuumDatabase(job, options?.forceVacuum, options?.analyzeAfter);
          break;

        case 'reindex':
          result = await this.reindexDatabase(job, options?.tables);
          break;

        case 'custom':
          result = await this.customCleanup(job, target, options);
          break;

        default:
          throw new Error(`Unknown cleanup task: ${task}`);
      }

      const duration = Date.now() - startTime;
      result.duration = duration;
      result.success = true;

      logger.info(`[Cleanup Worker] Job ${job.id} completed`, result);

      await job.updateProgress(100);
      return result;
    } catch (error: any) {
      logger.error(`[Cleanup Worker] Job ${job.id} failed:`, error);

      return {
        task,
        success: false,
        duration: Date.now() - startTime,
        errors: [error.message],
      };
    }
  }

  /**
   * Refresh materialized views
   */
  private async refreshMaterializedViews(
    job: Job<CleanupJobData>,
    target?: string
  ): Promise<CleanupJobResult> {
    logger.info('[Cleanup Worker] Refreshing materialized views');

    const views = target ? [target] : await this.getAllMaterializedViews();
    const total = views.length;
    let processed = 0;
    const errors: string[] = [];
    const details: any = {};

    for (const view of views) {
      try {
        const startTime = Date.now();

        // Refresh the view concurrently if possible
        await query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`);

        const duration = Date.now() - startTime;
        details[view] = { success: true, duration };

        logger.info(`[Cleanup Worker] Refreshed materialized view ${view} in ${duration}ms`);
        processed++;
      } catch (error: any) {
        // If concurrent refresh fails, try regular refresh
        try {
          await query(`REFRESH MATERIALIZED VIEW ${view}`);
          details[view] = { success: true, fallback: true };
          processed++;
        } catch (fallbackError: any) {
          logger.error(`[Cleanup Worker] Failed to refresh view ${view}:`, fallbackError);
          errors.push(`${view}: ${fallbackError.message}`);
          details[view] = { success: false, error: fallbackError.message };
        }
      }

      const progress = Math.round((processed / total) * 100);
      await job.updateProgress(progress);
    }

    // Clear related caches after refreshing views
    await this.clearViewRelatedCaches();

    return {
      task: 'refresh-views',
      success: errors.length === 0,
      itemsProcessed: processed,
      duration: 0,
      details,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Clean up old data
   */
  private async cleanupOldData(
    job: Job<CleanupJobData>,
    daysToKeep: number
  ): Promise<CleanupJobResult> {
    logger.info(`[Cleanup Worker] Cleaning up data older than ${daysToKeep} days`);

    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    let totalDeleted = 0;
    const details: any = {};

    // Clean up old search logs
    try {
      const searchLogs = await query(
        'DELETE FROM search_logs WHERE created_at < $1 RETURNING id',
        [cutoffDate]
      );
      const deleted = searchLogs.rows.length;
      totalDeleted += deleted;
      details.searchLogs = deleted;
      logger.info(`[Cleanup Worker] Deleted ${deleted} old search logs`);
    } catch (error) {
      logger.debug('[Cleanup Worker] search_logs table might not exist');
    }

    await job.updateProgress(20);

    // Clean up old property views
    try {
      const propertyViews = await query(
        'DELETE FROM property_views WHERE created_at < $1 RETURNING id',
        [cutoffDate]
      );
      const deleted = propertyViews.rows.length;
      totalDeleted += deleted;
      details.propertyViews = deleted;
      logger.info(`[Cleanup Worker] Deleted ${deleted} old property views`);
    } catch (error) {
      logger.debug('[Cleanup Worker] property_views table might not exist');
    }

    await job.updateProgress(40);

    // Clean up old error logs
    try {
      const errorLogs = await query(
        'DELETE FROM error_logs WHERE created_at < $1 RETURNING id',
        [cutoffDate]
      );
      const deleted = errorLogs.rows.length;
      totalDeleted += deleted;
      details.errorLogs = deleted;
      logger.info(`[Cleanup Worker] Deleted ${deleted} old error logs`);
    } catch (error) {
      logger.debug('[Cleanup Worker] error_logs table might not exist');
    }

    await job.updateProgress(60);

    // Clean up old job logs
    try {
      const jobLogs = await query(
        'DELETE FROM job_logs WHERE created_at < $1 RETURNING id',
        [cutoffDate]
      );
      const deleted = jobLogs.rows.length;
      totalDeleted += deleted;
      details.jobLogs = deleted;
      logger.info(`[Cleanup Worker] Deleted ${deleted} old job logs`);
    } catch (error) {
      logger.debug('[Cleanup Worker] job_logs table might not exist');
    }

    await job.updateProgress(80);

    // Clean up orphaned records
    await this.cleanupOrphanedRecords();

    await job.updateProgress(90);

    // Clear old cache entries
    await this.clearOldCaches(daysToKeep);

    return {
      task: 'cleanup-old-data',
      success: true,
      itemsDeleted: totalDeleted,
      duration: 0,
      details,
    };
  }

  /**
   * Optimize database
   */
  private async optimizeDatabase(
    job: Job<CleanupJobData>,
    options?: any
  ): Promise<CleanupJobResult> {
    logger.info('[Cleanup Worker] Optimizing database');

    const tables = options?.tables || await this.getAllTables();
    const total = tables.length;
    let processed = 0;
    const details: any = {};

    for (const table of tables) {
      try {
        // Analyze table to update statistics
        await query(`ANALYZE ${table}`);

        // Reindex if needed
        if (options?.reindex) {
          await query(`REINDEX TABLE ${table}`);
        }

        details[table] = { success: true };
        processed++;

        logger.info(`[Cleanup Worker] Optimized table ${table}`);
      } catch (error: any) {
        logger.error(`[Cleanup Worker] Failed to optimize table ${table}:`, error);
        details[table] = { success: false, error: error.message };
      }

      const progress = Math.round((processed / total) * 100);
      await job.updateProgress(progress);
    }

    return {
      task: 'optimize-db',
      success: true,
      itemsProcessed: processed,
      duration: 0,
      details,
    };
  }

  /**
   * Vacuum database
   */
  private async vacuumDatabase(
    job: Job<CleanupJobData>,
    forceVacuum?: boolean,
    analyzeAfter?: boolean
  ): Promise<CleanupJobResult> {
    logger.info('[Cleanup Worker] Vacuuming database');

    const tables = await this.getAllTables();
    const total = tables.length;
    let processed = 0;
    const details: any = {};

    for (const table of tables) {
      try {
        if (forceVacuum) {
          // Full vacuum (locks table)
          await query(`VACUUM FULL ${table}`);
          details[table] = { type: 'full' };
        } else {
          // Regular vacuum (doesn't lock)
          await query(`VACUUM ${table}`);
          details[table] = { type: 'regular' };
        }

        if (analyzeAfter) {
          await query(`ANALYZE ${table}`);
          details[table].analyzed = true;
        }

        processed++;
        logger.info(`[Cleanup Worker] Vacuumed table ${table}`);
      } catch (error: any) {
        logger.error(`[Cleanup Worker] Failed to vacuum table ${table}:`, error);
        details[table] = { success: false, error: error.message };
      }

      const progress = Math.round((processed / total) * 100);
      await job.updateProgress(progress);
    }

    return {
      task: 'vacuum',
      success: true,
      itemsProcessed: processed,
      duration: 0,
      details,
    };
  }

  /**
   * Reindex database tables
   */
  private async reindexDatabase(
    job: Job<CleanupJobData>,
    tables?: string[]
  ): Promise<CleanupJobResult> {
    logger.info('[Cleanup Worker] Reindexing database');

    const tablesToReindex = tables || await this.getAllTables();
    const total = tablesToReindex.length;
    let processed = 0;
    const details: any = {};

    for (const table of tablesToReindex) {
      try {
        // Get all indexes for the table
        const indexes = await query(`
          SELECT indexname FROM pg_indexes
          WHERE tablename = $1 AND schemaname = 'public'
        `, [table]);

        for (const index of indexes.rows) {
          await query(`REINDEX INDEX ${index.indexname}`);
        }

        details[table] = { success: true, indexCount: indexes.rows.length };
        processed++;

        logger.info(`[Cleanup Worker] Reindexed ${indexes.rows.length} indexes for table ${table}`);
      } catch (error: any) {
        logger.error(`[Cleanup Worker] Failed to reindex table ${table}:`, error);
        details[table] = { success: false, error: error.message };
      }

      const progress = Math.round((processed / total) * 100);
      await job.updateProgress(progress);
    }

    return {
      task: 'reindex',
      success: true,
      itemsProcessed: processed,
      duration: 0,
      details,
    };
  }

  /**
   * Custom cleanup task
   */
  private async customCleanup(
    job: Job<CleanupJobData>,
    target?: string,
    options?: any
  ): Promise<CleanupJobResult> {
    logger.info('[Cleanup Worker] Running custom cleanup task');

    // Implement custom cleanup logic based on target
    switch (target) {
      case 'temp-files':
        return await this.cleanupTempFiles();

      case 'expired-sessions':
        return await this.cleanupExpiredSessions();

      case 'duplicate-records':
        return await this.cleanupDuplicateRecords();

      default:
        throw new Error(`Unknown custom cleanup target: ${target}`);
    }
  }

  /**
   * Clean up temporary files
   */
  private async cleanupTempFiles(): Promise<CleanupJobResult> {
    // Implementation would depend on your file storage system
    logger.info('[Cleanup Worker] Cleaning up temporary files');

    return {
      task: 'custom',
      success: true,
      duration: 0,
      details: { type: 'temp-files' },
    };
  }

  /**
   * Clean up expired sessions
   */
  private async cleanupExpiredSessions(): Promise<CleanupJobResult> {
    try {
      const result = await query(
        'DELETE FROM sessions WHERE expires_at < NOW() RETURNING id'
      );

      return {
        task: 'custom',
        success: true,
        itemsDeleted: result.rows.length,
        duration: 0,
        details: { type: 'expired-sessions' },
      };
    } catch (error) {
      // Sessions table might not exist
      return {
        task: 'custom',
        success: true,
        itemsDeleted: 0,
        duration: 0,
        details: { type: 'expired-sessions', skipped: true },
      };
    }
  }

  /**
   * Clean up duplicate records
   */
  private async cleanupDuplicateRecords(): Promise<CleanupJobResult> {
    logger.info('[Cleanup Worker] Cleaning up duplicate records');

    let totalDeleted = 0;

    // Remove duplicate planning applications (keep the most recent)
    try {
      const duplicates = await query(`
        DELETE FROM planning_applications a
        USING planning_applications b
        WHERE a.id < b.id
        AND a.reference = b.reference
        AND a.council = b.council
        RETURNING a.id
      `);

      totalDeleted += duplicates.rows.length;
      logger.info(`[Cleanup Worker] Removed ${duplicates.rows.length} duplicate planning applications`);
    } catch (error) {
      logger.error('[Cleanup Worker] Error removing duplicate planning applications:', error);
    }

    return {
      task: 'custom',
      success: true,
      itemsDeleted: totalDeleted,
      duration: 0,
      details: { type: 'duplicate-records' },
    };
  }

  /**
   * Clean up orphaned records
   */
  private async cleanupOrphanedRecords(): Promise<void> {
    logger.info('[Cleanup Worker] Cleaning up orphaned records');

    // Clean up orphaned property transactions
    try {
      await query(`
        DELETE FROM property_transactions
        WHERE property_id NOT IN (SELECT id FROM properties)
      `);
    } catch (error) {
      logger.debug('[Cleanup Worker] Could not clean orphaned property transactions');
    }

    // Clean up orphaned planning documents
    try {
      await query(`
        DELETE FROM planning_documents
        WHERE application_id NOT IN (SELECT id FROM planning_applications)
      `);
    } catch (error) {
      logger.debug('[Cleanup Worker] Could not clean orphaned planning documents');
    }
  }

  /**
   * Clear old cache entries
   */
  private async clearOldCaches(daysToKeep: number): Promise<void> {
    logger.info('[Cleanup Worker] Clearing old cache entries');

    // Clear search result caches
    await deleteCacheByPattern('search:*');

    // Clear old property caches
    await deleteCacheByPattern('property:views:*');

    // Clear old statistics caches
    await deleteCacheByPattern('stats:*');

    logger.info('[Cleanup Worker] Cleared old cache entries');
  }

  /**
   * Clear view-related caches
   */
  private async clearViewRelatedCaches(): Promise<void> {
    logger.info('[Cleanup Worker] Clearing view-related caches');

    await deleteCacheByPattern('area:stats:*');
    await deleteCacheByPattern('council:stats:*');
    await deleteCacheByPattern('dashboard:*');
  }

  /**
   * Get all materialized views
   */
  private async getAllMaterializedViews(): Promise<string[]> {
    const result = await query(`
      SELECT matviewname FROM pg_matviews
      WHERE schemaname = 'public'
      ORDER BY matviewname
    `);

    return result.rows.map((row: any) => row.matviewname);
  }

  /**
   * Get all tables
   */
  private async getAllTables(): Promise<string[]> {
    const result = await query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename NOT LIKE 'pg_%'
      ORDER BY tablename
    `);

    return result.rows.map((row: any) => row.tablename);
  }

  /**
   * Setup event handlers for the worker
   */
  private setupEventHandlers(): void {
    this.worker.on('completed', (job: Job<CleanupJobData>, result: CleanupJobResult) => {
      logger.info(`[Cleanup Worker] Job ${job.id} completed successfully`, {
        task: job.data.task,
        success: result.success,
        itemsProcessed: result.itemsProcessed,
        itemsDeleted: result.itemsDeleted,
        duration: result.duration,
      });
    });

    this.worker.on('failed', (job: Job<CleanupJobData> | undefined, error: Error) => {
      if (job) {
        logger.error(`[Cleanup Worker] Job ${job.id} failed:`, {
          task: job.data.task,
          error: error.message,
          stack: error.stack,
        });
      }
    });

    this.worker.on('error', (error: Error) => {
      logger.error('[Cleanup Worker] Worker error:', error);
    });
  }

  /**
   * Gracefully shutdown the worker
   */
  public async shutdown(): Promise<void> {
    logger.info('[Cleanup Worker] Shutting down...');
    await this.worker.close();
    logger.info('[Cleanup Worker] Shutdown complete');
  }
}

// Export worker instance
let cleanupWorker: CleanupWorker | null = null;

export async function startCleanupWorker(): Promise<CleanupWorker> {
  if (!cleanupWorker) {
    cleanupWorker = new CleanupWorker();
  }
  return cleanupWorker;
}

export async function stopCleanupWorker(): Promise<void> {
  if (cleanupWorker) {
    await cleanupWorker.shutdown();
    cleanupWorker = null;
  }
}