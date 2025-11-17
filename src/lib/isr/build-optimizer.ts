/**
 * Build Optimization for ISR
 * Utilities to optimize build time and static generation
 */

import { ISRConfig } from './config';

interface BuildStats {
  totalPages: number;
  preGeneratedPages: number;
  onDemandPages: number;
  estimatedBuildTime: number; // in seconds
  memoryUsage: number; // in MB
}

interface GenerationProgress {
  type: string;
  current: number;
  total: number;
  percentage: number;
  timeElapsed: number;
  estimatedTimeRemaining: number;
}

/**
 * Calculate build statistics
 */
export async function calculateBuildStats(): Promise<BuildStats> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  try {
    // Fetch counts from API
    const [areasRes, propertiesRes, planningRes, newsRes] = await Promise.all([
      fetch(`${baseUrl}/api/areas?count=true`),
      fetch(`${baseUrl}/api/properties?count=true`),
      fetch(`${baseUrl}/api/planning?count=true`),
      fetch(`${baseUrl}/api/news?count=true`),
    ]);

    const [areas, properties, planning, news] = await Promise.all([
      areasRes.json(),
      propertiesRes.json(),
      planningRes.json(),
      newsRes.json(),
    ]);

    const totalAreas = areas.count || 100;
    const totalProperties = properties.count || 10000;
    const totalPlanning = planning.count || 1000;
    const totalNews = news.count || 500;

    const preGeneratedPages =
      totalAreas + // All areas are pre-generated
      Math.min(totalProperties, ISRConfig.buildLimits.properties as number) +
      Math.min(totalPlanning, ISRConfig.buildLimits.planning as number) +
      Math.min(totalNews, ISRConfig.buildLimits.news as number) +
      10; // Static pages (home, listing pages, etc.)

    const totalPages = totalAreas + totalProperties + totalPlanning + totalNews + 10;

    const onDemandPages = totalPages - preGeneratedPages;

    // Estimate build time (assuming 0.5 seconds per page average)
    const estimatedBuildTime = preGeneratedPages * 0.5;

    // Estimate memory usage (assuming 10MB per page average)
    const memoryUsage = preGeneratedPages * 10;

    return {
      totalPages,
      preGeneratedPages,
      onDemandPages,
      estimatedBuildTime,
      memoryUsage,
    };
  } catch (error) {
    console.error('Error calculating build stats:', error);
    return {
      totalPages: 0,
      preGeneratedPages: 0,
      onDemandPages: 0,
      estimatedBuildTime: 0,
      memoryUsage: 0,
    };
  }
}

/**
 * Progress reporter for build process
 */
export class BuildProgressReporter {
  private startTime: number;
  private progress: Map<string, GenerationProgress>;

  constructor() {
    this.startTime = Date.now();
    this.progress = new Map();
  }

  startGeneration(type: string, total: number) {
    this.progress.set(type, {
      type,
      current: 0,
      total,
      percentage: 0,
      timeElapsed: 0,
      estimatedTimeRemaining: 0,
    });

    console.log(`[ISR Build] Starting generation for ${type}: ${total} pages`);
  }

  updateProgress(type: string, current: number) {
    const progress = this.progress.get(type);
    if (!progress) return;

    const timeElapsed = (Date.now() - this.startTime) / 1000;
    const percentage = (current / progress.total) * 100;
    const avgTimePerPage = timeElapsed / current;
    const estimatedTimeRemaining = avgTimePerPage * (progress.total - current);

    this.progress.set(type, {
      ...progress,
      current,
      percentage,
      timeElapsed,
      estimatedTimeRemaining,
    });

    if (current % 10 === 0 || current === progress.total) {
      console.log(
        `[ISR Build] ${type}: ${current}/${progress.total} (${percentage.toFixed(1)}%) - ` +
          `ETA: ${estimatedTimeRemaining.toFixed(0)}s`
      );
    }
  }

  completeGeneration(type: string) {
    const progress = this.progress.get(type);
    if (!progress) return;

    console.log(
      `[ISR Build] Completed ${type}: ${progress.total} pages in ${progress.timeElapsed.toFixed(1)}s`
    );
  }

  getSummary(): string {
    const totalTime = (Date.now() - this.startTime) / 1000;
    let totalPages = 0;

    const summaryLines = ['[ISR Build] Generation Summary:'];

    this.progress.forEach((progress) => {
      totalPages += progress.current;
      summaryLines.push(
        `  - ${progress.type}: ${progress.current}/${progress.total} pages`
      );
    });

    summaryLines.push(`  Total: ${totalPages} pages in ${totalTime.toFixed(1)}s`);
    summaryLines.push(`  Average: ${(totalTime / totalPages).toFixed(2)}s per page`);

    return summaryLines.join('\n');
  }
}

/**
 * Optimize build order for parallel generation
 */
export function optimizeBuildOrder(): Array<{
  type: string;
  priority: number;
  parallel: boolean;
}> {
  return [
    { type: 'areas', priority: 1, parallel: true },      // Generate all areas first
    { type: 'properties', priority: 2, parallel: true }, // Generate top properties in parallel
    { type: 'planning', priority: 3, parallel: true },   // Generate recent planning apps
    { type: 'news', priority: 4, parallel: true },       // Generate recent news
  ];
}

/**
 * Check if build should be incremental or full
 */
export function shouldUseIncrementalBuild(
  lastBuildTime: Date,
  changedFiles: string[]
): boolean {
  const hoursSinceLastBuild =
    (Date.now() - lastBuildTime.getTime()) / (1000 * 60 * 60);

  // Full rebuild if:
  // - Last build was more than 24 hours ago
  // - Critical files changed
  // - More than 100 files changed
  if (hoursSinceLastBuild > 24) return false;
  if (changedFiles.some(file => file.includes('config') || file.includes('schema'))) return false;
  if (changedFiles.length > 100) return false;

  return true;
}

/**
 * Generate build configuration for Next.js
 */
export function generateBuildConfig() {
  return {
    // Limit concurrent page generation to prevent memory issues
    experimental: {
      workerThreads: false,
      cpus: 4,
    },

    // Configure static generation timeout
    staticPageGenerationTimeout: 120, // 2 minutes per page

    // Enable build output analysis
    generateBuildId: async () => {
      return `build-${Date.now()}`;
    },

    // Configure ISR fallback behavior
    fallback: {
      type: 'blocking',
      pages: ['/404', '/500'],
    },

    // Memory optimization
    webpack: (config: any) => {
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            default: false,
            vendors: false,
            framework: {
              name: 'framework',
              chunks: 'all',
              test: /(?<!node_modules.*)[\\/]node_modules[\\/](react|react-dom)[\\/]/,
              priority: 40,
              enforce: true,
            },
            lib: {
              test(module: any) {
                return module.size() > 160000;
              },
              name(module: any) {
                const hash = require('crypto')
                  .createHash('sha1')
                  .update(module.identifier())
                  .digest('hex');
                return `lib-${hash.substring(0, 8)}`;
              },
              priority: 30,
              minChunks: 1,
              reuseExistingChunk: true,
            },
            commons: {
              name: 'commons',
              chunks: 'initial',
              minChunks: 2,
              priority: 20,
            },
            shared: {
              name(module: any, chunks: any) {
                const hash = require('crypto')
                  .createHash('sha1')
                  .update(chunks.reduce((acc: string, chunk: any) => acc + chunk.name, ''))
                  .digest('hex');
                return `shared-${hash.substring(0, 8)}`;
              },
              priority: 10,
              minChunks: 2,
              reuseExistingChunk: true,
            },
          },
          maxAsyncRequests: 30,
          maxInitialRequests: 30,
        },
      };
      return config;
    },
  };
}