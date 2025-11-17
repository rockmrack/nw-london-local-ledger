/**
 * Cache Warming System
 * Preloads frequently accessed data into cache layers for optimal performance
 */

import { getMultiLayerCache, MultiLayerCache } from './multi-layer-cache';
import { CacheTags } from './cache-tags';
import { prisma } from '@/lib/db/prisma';

export interface WarmingStrategy {
  name: string;
  priority: number;
  enabled: boolean;
  schedule?: string; // Cron expression
  ttl?: number; // Cache TTL in seconds
  batchSize?: number;
}

export class CacheWarmer {
  private cache: MultiLayerCache;
  private isWarming = false;
  private warmingStats = {
    lastRun: null as Date | null,
    itemsWarmed: 0,
    duration: 0,
    errors: 0,
  };

  constructor(cache?: MultiLayerCache) {
    this.cache = cache || getMultiLayerCache();
  }

  /**
   * Warm all caches based on strategies
   */
  async warmAll(): Promise<void> {
    if (this.isWarming) {
      console.log('Cache warming already in progress');
      return;
    }

    this.isWarming = true;
    const startTime = Date.now();
    this.warmingStats = {
      lastRun: new Date(),
      itemsWarmed: 0,
      duration: 0,
      errors: 0,
    };

    try {
      console.log('🔥 Starting cache warming...');

      // Run all warming strategies in parallel
      const strategies = this.getWarmingStrategies();
      const results = await Promise.allSettled(
        strategies
          .filter(s => s.enabled)
          .map(strategy => this.executeStrategy(strategy))
      );

      // Log results
      results.forEach((result, index) => {
        const strategy = strategies[index];
        if (result.status === 'rejected') {
          console.error(`❌ Strategy "${strategy.name}" failed:`, result.reason);
          this.warmingStats.errors++;
        }
      });

      this.warmingStats.duration = Date.now() - startTime;
      console.log(
        `✅ Cache warming completed: ${this.warmingStats.itemsWarmed} items in ${this.warmingStats.duration}ms`
      );
    } catch (error) {
      console.error('Cache warming failed:', error);
      this.warmingStats.errors++;
    } finally {
      this.isWarming = false;
    }
  }

  /**
   * Get warming strategies
   */
  private getWarmingStrategies(): WarmingStrategy[] {
    return [
      {
        name: 'recent-properties',
        priority: 1,
        enabled: true,
        ttl: 3600, // 1 hour
        batchSize: 100,
      },
      {
        name: 'popular-areas',
        priority: 2,
        enabled: true,
        ttl: 7200, // 2 hours
        batchSize: 50,
      },
      {
        name: 'active-planning',
        priority: 3,
        enabled: true,
        ttl: 3600, // 1 hour
        batchSize: 100,
      },
      {
        name: 'top-schools',
        priority: 4,
        enabled: true,
        ttl: 86400, // 24 hours
        batchSize: 50,
      },
      {
        name: 'transport-stations',
        priority: 5,
        enabled: true,
        ttl: 86400, // 24 hours
        batchSize: 200,
      },
      {
        name: 'council-tax-bands',
        priority: 6,
        enabled: true,
        ttl: 86400, // 24 hours
      },
      {
        name: 'crime-stats',
        priority: 7,
        enabled: true,
        ttl: 86400, // 24 hours
        batchSize: 100,
      },
    ];
  }

  /**
   * Execute a warming strategy
   */
  private async executeStrategy(strategy: WarmingStrategy): Promise<void> {
    console.log(`🔥 Executing strategy: ${strategy.name}`);

    switch (strategy.name) {
      case 'recent-properties':
        await this.warmRecentProperties(strategy);
        break;
      case 'popular-areas':
        await this.warmPopularAreas(strategy);
        break;
      case 'active-planning':
        await this.warmActivePlanning(strategy);
        break;
      case 'top-schools':
        await this.warmTopSchools(strategy);
        break;
      case 'transport-stations':
        await this.warmTransportStations(strategy);
        break;
      case 'council-tax-bands':
        await this.warmCouncilTaxBands(strategy);
        break;
      case 'crime-stats':
        await this.warmCrimeStats(strategy);
        break;
      default:
        console.warn(`Unknown warming strategy: ${strategy.name}`);
    }
  }

  /**
   * Warm recent property listings
   */
  private async warmRecentProperties(strategy: WarmingStrategy): Promise<void> {
    try {
      const properties = await prisma.property.findMany({
        take: strategy.batchSize || 100,
        orderBy: { createdAt: 'desc' },
        include: {
          prices: {
            orderBy: { date: 'desc' },
            take: 1,
          },
        },
      });

      const entries = properties.map(property => ({
        key: `property:${property.id}`,
        value: property,
        ttl: strategy.ttl,
        tags: CacheTags.forProperty({
          id: property.id,
          area: property.area || undefined,
          council: property.council,
          postcode: property.postcode,
          type: property.propertyType,
        }),
      }));

      await this.cache.mset(entries);
      this.warmingStats.itemsWarmed += entries.length;
      console.log(`  ✅ Warmed ${entries.length} recent properties`);
    } catch (error) {
      console.error('Failed to warm recent properties:', error);
      throw error;
    }
  }

  /**
   * Warm popular area data
   */
  private async warmPopularAreas(strategy: WarmingStrategy): Promise<void> {
    try {
      // Get areas with most properties
      const popularAreas = await prisma.property.groupBy({
        by: ['area'],
        _count: { id: true },
        where: { area: { not: null } },
        orderBy: { _count: { id: 'desc' } },
        take: strategy.batchSize || 50,
      });

      const entries = [];

      for (const area of popularAreas) {
        if (!area.area) continue;

        // Get aggregated stats for each area
        const [avgPrice, propertyCount, schoolCount] = await Promise.all([
          prisma.propertyPrice.aggregate({
            where: { property: { area: area.area } },
            _avg: { price: true },
          }),
          prisma.property.count({
            where: { area: area.area },
          }),
          prisma.school.count({
            where: {
              OR: [
                { address: { contains: area.area } },
                { postcode: { startsWith: area.area.substring(0, 3) } },
              ],
            },
          }),
        ]);

        const areaStats = {
          area: area.area,
          propertyCount,
          avgPrice: avgPrice._avg.price,
          schoolCount,
        };

        entries.push({
          key: `area:stats:${area.area.toLowerCase().replace(/\s+/g, '-')}`,
          value: areaStats,
          ttl: strategy.ttl,
          tags: [CacheTags.propertyArea(area.area)],
        });
      }

      await this.cache.mset(entries);
      this.warmingStats.itemsWarmed += entries.length;
      console.log(`  ✅ Warmed ${entries.length} popular areas`);
    } catch (error) {
      console.error('Failed to warm popular areas:', error);
      throw error;
    }
  }

  /**
   * Warm active planning applications
   */
  private async warmActivePlanning(strategy: WarmingStrategy): Promise<void> {
    try {
      const activePlanning = await prisma.planningApplication.findMany({
        where: {
          status: { in: ['Pending', 'Under Review', 'Awaiting Decision'] },
        },
        take: strategy.batchSize || 100,
        orderBy: { receivedDate: 'desc' },
      });

      const entries = activePlanning.map(app => ({
        key: `planning:${app.id}`,
        value: app,
        ttl: strategy.ttl,
        tags: CacheTags.forPlanning({
          id: app.id,
          council: app.council,
          status: app.status,
          year: app.receivedDate ? new Date(app.receivedDate).getFullYear() : undefined,
        }),
      }));

      await this.cache.mset(entries);
      this.warmingStats.itemsWarmed += entries.length;
      console.log(`  ✅ Warmed ${entries.length} active planning applications`);
    } catch (error) {
      console.error('Failed to warm planning applications:', error);
      throw error;
    }
  }

  /**
   * Warm top-rated schools
   */
  private async warmTopSchools(strategy: WarmingStrategy): Promise<void> {
    try {
      const topSchools = await prisma.school.findMany({
        where: { ofstedRating: { in: ['Outstanding', 'Good'] } },
        take: strategy.batchSize || 50,
        include: {
          performanceData: true,
        },
      });

      const entries = topSchools.map(school => ({
        key: `school:${school.id}`,
        value: school,
        ttl: strategy.ttl,
        tags: CacheTags.forSchool({
          id: school.id,
          type: school.type,
          rating: school.ofstedRating || undefined,
        }),
      }));

      await this.cache.mset(entries);
      this.warmingStats.itemsWarmed += entries.length;
      console.log(`  ✅ Warmed ${entries.length} top schools`);
    } catch (error) {
      console.error('Failed to warm schools:', error);
      throw error;
    }
  }

  /**
   * Warm transport station data
   */
  private async warmTransportStations(strategy: WarmingStrategy): Promise<void> {
    try {
      const stations = await prisma.transportStation.findMany({
        take: strategy.batchSize || 200,
        include: {
          lines: true,
        },
      });

      const entries = stations.map(station => ({
        key: `transport:station:${station.id}`,
        value: station,
        ttl: strategy.ttl,
        tags: [
          CacheTags.transportStation(station.id),
          ...station.lines.map(line => CacheTags.transportLine(line.name)),
          ...(station.zone ? [CacheTags.transportZone(station.zone)] : []),
        ],
      }));

      await this.cache.mset(entries);
      this.warmingStats.itemsWarmed += entries.length;
      console.log(`  ✅ Warmed ${entries.length} transport stations`);
    } catch (error) {
      console.error('Failed to warm transport stations:', error);
      throw error;
    }
  }

  /**
   * Warm council tax bands
   */
  private async warmCouncilTaxBands(strategy: WarmingStrategy): Promise<void> {
    try {
      const councils = await prisma.councilTaxBand.groupBy({
        by: ['council'],
      });

      const entries = [];

      for (const { council } of councils) {
        const bands = await prisma.councilTaxBand.findMany({
          where: { council },
          orderBy: { band: 'asc' },
        });

        entries.push({
          key: `tax:bands:${council.toLowerCase().replace(/\s+/g, '-')}`,
          value: bands,
          ttl: strategy.ttl,
          tags: [CacheTags.councilTax(council)],
        });
      }

      await this.cache.mset(entries);
      this.warmingStats.itemsWarmed += entries.length;
      console.log(`  ✅ Warmed council tax bands for ${councils.length} councils`);
    } catch (error) {
      console.error('Failed to warm council tax bands:', error);
      throw error;
    }
  }

  /**
   * Warm crime statistics
   */
  private async warmCrimeStats(strategy: WarmingStrategy): Promise<void> {
    try {
      // Get recent crime stats grouped by area
      const recentDate = new Date();
      recentDate.setMonth(recentDate.getMonth() - 3); // Last 3 months

      const crimeAreas = await prisma.crimeIncident.groupBy({
        by: ['area'],
        where: {
          date: { gte: recentDate },
        },
        _count: { id: true },
        take: strategy.batchSize || 100,
        orderBy: { _count: { id: 'desc' } },
      });

      const entries = [];

      for (const area of crimeAreas) {
        const stats = await prisma.crimeIncident.groupBy({
          by: ['category'],
          where: {
            area: area.area,
            date: { gte: recentDate },
          },
          _count: { id: true },
        });

        entries.push({
          key: `crime:stats:${area.area.toLowerCase().replace(/\s+/g, '-')}`,
          value: {
            area: area.area,
            totalIncidents: area._count.id,
            byCategory: stats,
            period: '3months',
          },
          ttl: strategy.ttl,
          tags: [CacheTags.crime(area.area)],
        });
      }

      await this.cache.mset(entries);
      this.warmingStats.itemsWarmed += entries.length;
      console.log(`  ✅ Warmed crime stats for ${entries.length} areas`);
    } catch (error) {
      console.error('Failed to warm crime stats:', error);
      throw error;
    }
  }

  /**
   * Get warming statistics
   */
  getStats() {
    return { ...this.warmingStats };
  }

  /**
   * Check if warming is in progress
   */
  isWarmingInProgress(): boolean {
    return this.isWarming;
  }
}

// Queue job handler for cache warming
export async function handleCacheWarmingJob(data: {
  strategies?: string[];
  force?: boolean;
}): Promise<void> {
  const warmer = new CacheWarmer();

  if (data.strategies && data.strategies.length > 0) {
    // Warm specific strategies
    for (const strategyName of data.strategies) {
      const strategy = warmer['getWarmingStrategies']().find(s => s.name === strategyName);
      if (strategy) {
        await warmer['executeStrategy'](strategy);
      }
    }
  } else {
    // Warm all enabled strategies
    await warmer.warmAll();
  }
}

export default CacheWarmer;