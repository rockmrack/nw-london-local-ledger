/**
 * Cache Warmer Queue Worker
 * Pre-emptively warms caches for better performance
 */

import { Worker, Job } from 'bullmq';
import { REDIS_CONFIG, getQueueConfig } from '../config/queue.config';
import { queueService } from '../services/queue.service';
import { logger } from '@/lib/logging/logger';
import { connectRedis, setCache, batchSetCache } from '@/lib/cache/redis';
import { connectDb, query } from '@/lib/database/postgres';
import { searchService } from '@/lib/search/elasticsearch';

interface CacheWarmerJobData {
  type: 'popular' | 'areas' | 'properties' | 'planning' | 'search' | 'custom';
  targets?: string[]; // Specific targets to warm
  ttl?: number; // Cache TTL in seconds
  force?: boolean; // Force refresh even if cache exists
  priority?: 'high' | 'normal' | 'low';
}

interface CacheWarmerJobResult {
  type: string;
  warmed: number;
  skipped: number;
  failed: number;
  duration: number;
  errors?: string[];
}

interface CacheEntry {
  key: string;
  value: any;
  ttl?: number;
}

class CacheWarmerWorker {
  private worker: Worker<CacheWarmerJobData, CacheWarmerJobResult>;
  private readonly DEFAULT_TTL = 3600; // 1 hour
  private readonly AREA_TTL = 7200; // 2 hours
  private readonly POPULAR_TTL = 1800; // 30 minutes

  constructor() {
    const config = getQueueConfig('cache-warmer-queue');

    this.worker = new Worker<CacheWarmerJobData, CacheWarmerJobResult>(
      'cache-warmer-queue',
      async (job: Job<CacheWarmerJobData>) => await this.process(job),
      {
        ...config.workerOptions,
        connection: REDIS_CONFIG.connection,
      }
    );

    this.setupEventHandlers();

    // Register worker with queue service
    queueService.registerWorker('cache-warmer-queue', this.worker);
  }

  /**
   * Process a cache warming job
   */
  private async process(job: Job<CacheWarmerJobData>): Promise<CacheWarmerJobResult> {
    const startTime = Date.now();
    const { type, targets, ttl, force } = job.data;

    logger.info(`[Cache Warmer] Processing job ${job.id}`, {
      type,
      targetsCount: targets?.length,
      force,
    });

    await job.updateProgress(0);

    try {
      // Connect to services
      await Promise.all([
        connectRedis(),
        connectDb(),
      ]);

      let result: CacheWarmerJobResult;

      switch (type) {
        case 'popular':
          result = await this.warmPopularCaches(job, ttl || this.POPULAR_TTL, force);
          break;

        case 'areas':
          result = await this.warmAreaCaches(job, ttl || this.AREA_TTL, force);
          break;

        case 'properties':
          result = await this.warmPropertyCaches(job, targets, ttl || this.DEFAULT_TTL, force);
          break;

        case 'planning':
          result = await this.warmPlanningCaches(job, targets, ttl || this.DEFAULT_TTL, force);
          break;

        case 'search':
          result = await this.warmSearchCaches(job, ttl || this.DEFAULT_TTL, force);
          break;

        case 'custom':
          result = await this.warmCustomCaches(job, targets || [], ttl || this.DEFAULT_TTL, force);
          break;

        default:
          throw new Error(`Unknown cache type: ${type}`);
      }

      const duration = Date.now() - startTime;
      result.duration = duration;

      logger.info(`[Cache Warmer] Job ${job.id} completed`, result);

      await job.updateProgress(100);
      return result;
    } catch (error) {
      logger.error(`[Cache Warmer] Job ${job.id} failed:`, error);
      throw error;
    }
  }

  /**
   * Warm popular/frequently accessed caches
   */
  private async warmPopularCaches(
    job: Job<CacheWarmerJobData>,
    ttl: number,
    force?: boolean
  ): Promise<CacheWarmerJobResult> {
    logger.info('[Cache Warmer] Warming popular caches');

    const cacheEntries: CacheEntry[] = [];
    const errors: string[] = [];

    try {
      // Get most viewed properties
      const popularProperties = await query(`
        SELECT p.*, COUNT(pv.id) as view_count
        FROM properties p
        LEFT JOIN property_views pv ON p.id = pv.property_id
        WHERE pv.created_at > NOW() - INTERVAL '7 days'
        GROUP BY p.id
        ORDER BY view_count DESC
        LIMIT 100
      `);

      for (const property of popularProperties.rows) {
        cacheEntries.push({
          key: `property:${property.id}`,
          value: property,
          ttl,
        });
        cacheEntries.push({
          key: `property:slug:${property.slug}`,
          value: property,
          ttl,
        });
      }

      await job.updateProgress(25);

      // Get recent planning applications
      const recentPlanning = await query(`
        SELECT * FROM planning_applications
        WHERE created_at > NOW() - INTERVAL '7 days'
        ORDER BY created_at DESC
        LIMIT 100
      `);

      for (const app of recentPlanning.rows) {
        cacheEntries.push({
          key: `planning:${app.id}`,
          value: app,
          ttl,
        });
        cacheEntries.push({
          key: `planning:ref:${app.reference}`,
          value: app,
          ttl,
        });
      }

      await job.updateProgress(50);

      // Get trending searches
      const trendingSearches = await query(`
        SELECT query, COUNT(*) as search_count
        FROM search_logs
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY query
        ORDER BY search_count DESC
        LIMIT 50
      `);

      for (const search of trendingSearches.rows) {
        const searchResults = await searchService.search(search.query, { limit: 20 });
        cacheEntries.push({
          key: `search:${search.query}`,
          value: searchResults,
          ttl,
        });
      }

      await job.updateProgress(75);

    } catch (error: any) {
      logger.error('[Cache Warmer] Error preparing popular caches:', error);
      errors.push(error.message);
    }

    // Warm the caches
    const result = await this.warmCaches(cacheEntries, force);

    return {
      type: 'popular',
      warmed: result.warmed,
      skipped: result.skipped,
      failed: result.failed,
      duration: 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Warm area-specific caches
   */
  private async warmAreaCaches(
    job: Job<CacheWarmerJobData>,
    ttl: number,
    force?: boolean
  ): Promise<CacheWarmerJobResult> {
    logger.info('[Cache Warmer] Warming area caches');

    const cacheEntries: CacheEntry[] = [];

    // Get all areas
    const areas = await query('SELECT * FROM areas ORDER BY name');

    let processed = 0;
    const total = areas.rows.length;

    for (const area of areas.rows) {
      // Cache area data
      cacheEntries.push({
        key: `area:${area.id}`,
        value: area,
        ttl,
      });
      cacheEntries.push({
        key: `area:slug:${area.slug}`,
        value: area,
        ttl,
      });

      // Cache area statistics
      const stats = await this.getAreaStatistics(area.id);
      cacheEntries.push({
        key: `area:stats:${area.id}`,
        value: stats,
        ttl,
      });

      // Cache recent properties in area
      const properties = await query(
        'SELECT * FROM properties WHERE area_id = $1 ORDER BY created_at DESC LIMIT 10',
        [area.id]
      );
      cacheEntries.push({
        key: `area:properties:${area.id}`,
        value: properties.rows,
        ttl,
      });

      processed++;
      const progress = Math.round((processed / total) * 100);
      await job.updateProgress(progress);
    }

    const result = await this.warmCaches(cacheEntries, force);

    return {
      type: 'areas',
      warmed: result.warmed,
      skipped: result.skipped,
      failed: result.failed,
      duration: 0,
    };
  }

  /**
   * Warm property caches
   */
  private async warmPropertyCaches(
    job: Job<CacheWarmerJobData>,
    targets?: string[],
    ttl: number = this.DEFAULT_TTL,
    force?: boolean
  ): Promise<CacheWarmerJobResult> {
    logger.info('[Cache Warmer] Warming property caches');

    const cacheEntries: CacheEntry[] = [];

    let properties;
    if (targets && targets.length > 0) {
      // Warm specific properties
      const ids = targets.map(t => parseInt(t)).filter(id => !isNaN(id));
      properties = await query('SELECT * FROM properties WHERE id = ANY($1)', [ids]);
    } else {
      // Warm recently updated properties
      properties = await query(`
        SELECT * FROM properties
        WHERE updated_at > NOW() - INTERVAL '24 hours'
        LIMIT 500
      `);
    }

    for (const property of properties.rows) {
      cacheEntries.push({
        key: `property:${property.id}`,
        value: property,
        ttl,
      });

      // Also cache by slug
      if (property.slug) {
        cacheEntries.push({
          key: `property:slug:${property.slug}`,
          value: property,
          ttl,
        });
      }

      // Cache related data
      const relatedData = await this.getPropertyRelatedData(property.id);
      cacheEntries.push({
        key: `property:related:${property.id}`,
        value: relatedData,
        ttl: ttl / 2, // Shorter TTL for related data
      });
    }

    const result = await this.warmCaches(cacheEntries, force);

    return {
      type: 'properties',
      warmed: result.warmed,
      skipped: result.skipped,
      failed: result.failed,
      duration: 0,
    };
  }

  /**
   * Warm planning application caches
   */
  private async warmPlanningCaches(
    job: Job<CacheWarmerJobData>,
    targets?: string[],
    ttl: number = this.DEFAULT_TTL,
    force?: boolean
  ): Promise<CacheWarmerJobResult> {
    logger.info('[Cache Warmer] Warming planning caches');

    const cacheEntries: CacheEntry[] = [];

    let applications;
    if (targets && targets.length > 0) {
      // Warm specific applications
      applications = await query(
        'SELECT * FROM planning_applications WHERE reference = ANY($1)',
        [targets]
      );
    } else {
      // Warm recent applications
      applications = await query(`
        SELECT * FROM planning_applications
        WHERE created_at > NOW() - INTERVAL '7 days'
        ORDER BY created_at DESC
        LIMIT 500
      `);
    }

    for (const app of applications.rows) {
      cacheEntries.push({
        key: `planning:${app.id}`,
        value: app,
        ttl,
      });
      cacheEntries.push({
        key: `planning:ref:${app.reference}`,
        value: app,
        ttl,
      });

      // Cache by status
      const statusKey = `planning:status:${app.status}:${app.council}`;
      const existing = cacheEntries.find(e => e.key === statusKey);
      if (!existing) {
        const statusApps = await query(
          'SELECT * FROM planning_applications WHERE status = $1 AND council = $2 LIMIT 20',
          [app.status, app.council]
        );
        cacheEntries.push({
          key: statusKey,
          value: statusApps.rows,
          ttl,
        });
      }
    }

    const result = await this.warmCaches(cacheEntries, force);

    return {
      type: 'planning',
      warmed: result.warmed,
      skipped: result.skipped,
      failed: result.failed,
      duration: 0,
    };
  }

  /**
   * Warm search result caches
   */
  private async warmSearchCaches(
    job: Job<CacheWarmerJobData>,
    ttl: number,
    force?: boolean
  ): Promise<CacheWarmerJobResult> {
    logger.info('[Cache Warmer] Warming search caches');

    const cacheEntries: CacheEntry[] = [];

    // Get common search terms
    const commonSearches = [
      'house',
      'flat',
      'apartment',
      'planning',
      'extension',
      'development',
      'barnet',
      'brent',
      'camden',
      'ealing',
      'harrow',
      'westminster',
    ];

    // Also get from search logs if available
    try {
      const searchLogs = await query(`
        SELECT DISTINCT query FROM search_logs
        WHERE created_at > NOW() - INTERVAL '7 days'
        ORDER BY COUNT(*) DESC
        LIMIT 20
      `);
      commonSearches.push(...searchLogs.rows.map((r: any) => r.query));
    } catch (error) {
      // Search logs table might not exist
      logger.debug('[Cache Warmer] Could not fetch search logs');
    }

    let processed = 0;
    const total = commonSearches.length;

    for (const term of commonSearches) {
      try {
        const results = await searchService.search(term, { limit: 50 });
        cacheEntries.push({
          key: `search:${term}`,
          value: results,
          ttl,
        });
      } catch (error) {
        logger.error(`[Cache Warmer] Failed to search for "${term}":`, error);
      }

      processed++;
      const progress = Math.round((processed / total) * 100);
      await job.updateProgress(progress);
    }

    const result = await this.warmCaches(cacheEntries, force);

    return {
      type: 'search',
      warmed: result.warmed,
      skipped: result.skipped,
      failed: result.failed,
      duration: 0,
    };
  }

  /**
   * Warm custom caches
   */
  private async warmCustomCaches(
    job: Job<CacheWarmerJobData>,
    targets: string[],
    ttl: number,
    force?: boolean
  ): Promise<CacheWarmerJobResult> {
    logger.info('[Cache Warmer] Warming custom caches');

    if (!targets || targets.length === 0) {
      return {
        type: 'custom',
        warmed: 0,
        skipped: 0,
        failed: 0,
        duration: 0,
      };
    }

    const cacheEntries: CacheEntry[] = [];

    for (const target of targets) {
      // Parse target format: "type:id" or custom key
      const [type, id] = target.split(':');

      try {
        let value;
        switch (type) {
          case 'property':
            const property = await query('SELECT * FROM properties WHERE id = $1', [id]);
            value = property.rows[0];
            break;

          case 'area':
            const area = await query('SELECT * FROM areas WHERE id = $1', [id]);
            value = area.rows[0];
            break;

          case 'planning':
            const planning = await query('SELECT * FROM planning_applications WHERE id = $1', [id]);
            value = planning.rows[0];
            break;

          default:
            // Skip unknown types
            continue;
        }

        if (value) {
          cacheEntries.push({
            key: target,
            value,
            ttl,
          });
        }
      } catch (error) {
        logger.error(`[Cache Warmer] Failed to fetch custom target ${target}:`, error);
      }
    }

    const result = await this.warmCaches(cacheEntries, force);

    return {
      type: 'custom',
      warmed: result.warmed,
      skipped: result.skipped,
      failed: result.failed,
      duration: 0,
    };
  }

  /**
   * Actually warm the caches
   */
  private async warmCaches(
    entries: CacheEntry[],
    force?: boolean
  ): Promise<{ warmed: number; skipped: number; failed: number }> {
    let warmed = 0;
    let skipped = 0;
    let failed = 0;

    // Use batch operations for better performance
    const entriesToWarm: Array<{ key: string; value: any; ttlSeconds?: number }> = [];

    for (const entry of entries) {
      try {
        if (!force) {
          // Check if cache already exists
          const exists = await this.cacheExists(entry.key);
          if (exists) {
            skipped++;
            continue;
          }
        }

        entriesToWarm.push({
          key: entry.key,
          value: entry.value,
          ttlSeconds: entry.ttl,
        });
      } catch (error) {
        logger.error(`[Cache Warmer] Failed to check cache ${entry.key}:`, error);
        failed++;
      }
    }

    // Batch set caches
    if (entriesToWarm.length > 0) {
      try {
        await batchSetCache(entriesToWarm);
        warmed = entriesToWarm.length;
      } catch (error) {
        logger.error('[Cache Warmer] Batch cache warming failed:', error);
        failed += entriesToWarm.length;
      }
    }

    return { warmed, skipped, failed };
  }

  /**
   * Check if cache exists
   */
  private async cacheExists(key: string): Promise<boolean> {
    const { existsInCache } = await import('@/lib/cache/redis');
    return await existsInCache(key);
  }

  /**
   * Get area statistics
   */
  private async getAreaStatistics(areaId: number): Promise<any> {
    const [properties, planning, avgPrice] = await Promise.all([
      query('SELECT COUNT(*) as count FROM properties WHERE area_id = $1', [areaId]),
      query('SELECT COUNT(*) as count FROM planning_applications WHERE area_id = $1', [areaId]),
      query('SELECT AVG(current_value) as avg FROM properties WHERE area_id = $1', [areaId]),
    ]);

    return {
      propertyCount: properties.rows[0].count,
      planningCount: planning.rows[0].count,
      avgPropertyValue: avgPrice.rows[0].avg,
      lastUpdated: new Date(),
    };
  }

  /**
   * Get property related data
   */
  private async getPropertyRelatedData(propertyId: number): Promise<any> {
    const [transactions, planning, nearby] = await Promise.all([
      query(
        'SELECT * FROM property_transactions WHERE property_id = $1 ORDER BY transaction_date DESC LIMIT 5',
        [propertyId]
      ),
      query(
        'SELECT * FROM planning_applications WHERE property_id = $1 ORDER BY created_at DESC LIMIT 5',
        [propertyId]
      ),
      query(`
        SELECT * FROM properties
        WHERE id != $1
        AND ST_DWithin(location, (SELECT location FROM properties WHERE id = $1), 100)
        LIMIT 5
      `, [propertyId]),
    ]);

    return {
      transactions: transactions.rows,
      planningApplications: planning.rows,
      nearbyProperties: nearby.rows,
    };
  }

  /**
   * Setup event handlers for the worker
   */
  private setupEventHandlers(): void {
    this.worker.on('completed', (job: Job<CacheWarmerJobData>, result: CacheWarmerJobResult) => {
      logger.info(`[Cache Warmer] Job ${job.id} completed successfully`, {
        type: job.data.type,
        warmed: result.warmed,
        skipped: result.skipped,
        failed: result.failed,
        duration: result.duration,
      });
    });

    this.worker.on('failed', (job: Job<CacheWarmerJobData> | undefined, error: Error) => {
      if (job) {
        logger.error(`[Cache Warmer] Job ${job.id} failed:`, {
          type: job.data.type,
          error: error.message,
          stack: error.stack,
        });
      }
    });

    this.worker.on('error', (error: Error) => {
      logger.error('[Cache Warmer] Worker error:', error);
    });
  }

  /**
   * Gracefully shutdown the worker
   */
  public async shutdown(): Promise<void> {
    logger.info('[Cache Warmer] Shutting down...');
    await this.worker.close();
    logger.info('[Cache Warmer] Shutdown complete');
  }
}

// Export worker instance
let cacheWarmerWorker: CacheWarmerWorker | null = null;

export async function startCacheWarmerWorker(): Promise<CacheWarmerWorker> {
  if (!cacheWarmerWorker) {
    cacheWarmerWorker = new CacheWarmerWorker();
  }
  return cacheWarmerWorker;
}

export async function stopCacheWarmerWorker(): Promise<void> {
  if (cacheWarmerWorker) {
    await cacheWarmerWorker.shutdown();
    cacheWarmerWorker = null;
  }
}