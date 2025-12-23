/**
 * ISR Utility Functions
 * Helper functions for managing ISR and static generation
 */

import { cache } from 'react';
import { ISRConfig } from './config';
import { areaService } from '@/services/area/AreaService';
import { propertyService } from '@/services/property/PropertyService';
import { planningService } from '@/services/planning/PlanningService';
import { newsService } from '@/services/news/NewsService';

/**
 * Check if we're in a build context (no runtime server available)
 */
function isBuildContext(): boolean {
  // During Vercel build, NEXT_PHASE is set to 'phase-production-build'
  // Also check if we're in a CI environment or if runtime variables are missing
  return (
    process.env.NEXT_PHASE === 'phase-production-build' || 
    process.env.CI === 'true' ||
    process.env.VERCEL_ENV === 'production' && !process.env.VERCEL_URL ||
    typeof window === 'undefined' && process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL
  );
}

/**
 * Get base URL for API calls, handling build context
 */
function getApiBaseUrl(): string | null {
  // During build, if no production URL is available, return null to skip fetching
  if (isBuildContext() && !process.env.VERCEL_URL && !process.env.NEXT_PUBLIC_BASE_URL) {
    return null;
  }
  
  return process.env.NEXT_PUBLIC_BASE_URL || 
         (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
}

/**
 * Create a cached fetch function with ISR configuration
 */
export const createISRFetch = (revalidate: number) => {
  return cache(async (url: string) => {
    const response = await fetch(url, {
      next: { revalidate },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }

    return response.json();
  });
};

/**
 * Get all area slugs for static generation
 */
export async function getAllAreaSlugs(): Promise<string[]> {
  try {
    // During build, if no database connection is available, return empty array
    // Pages will be generated on-demand (ISR) instead of at build time
    if (isBuildContext() && !process.env.DATABASE_URL) {
      console.log('Build context detected without DATABASE_URL - skipping static generation for areas');
      return [];
    }
    const areas = await areaService.getAllAreas();
    return areas.map(area => area.slug);
  } catch (error) {
    console.error('Error fetching area slugs:', error);
    return [];
  }
}

/**
 * Get top property slugs for static generation
 */
export async function getTopPropertySlugs(limit: number = 1000): Promise<string[]> {
  try {
    // During build, if no database connection is available, return empty array
    if (isBuildContext() && !process.env.DATABASE_URL) {
      console.log('Build context detected without DATABASE_URL - skipping static generation for properties');
      return [];
    }
    const result = await propertyService.searchProperties({
      limit,
      sortBy: 'date',
      sortOrder: 'desc'
    });
    return result.properties.map(prop => prop.slug);
  } catch (error) {
    console.error('Error fetching property slugs:', error);
    return [];
  }
}

/**
 * Get recent planning application IDs for static generation
 */
export async function getRecentPlanningIds(limit: number = 100): Promise<string[]> {
  try {
    // During build, if no database connection is available, return empty array
    if (isBuildContext() && !process.env.DATABASE_URL) {
      console.log('Build context detected without DATABASE_URL - skipping static generation for planning');
      return [];
    }
    const result = await planningService.searchPlanningApplications({ limit });
    return result.applications.map(app => app.slug || app.reference);
  } catch (error) {
    console.error('Error fetching planning IDs:', error);
    return [];
  }
}

/**
 * Get news article slugs for static generation
 */
export async function getNewsArticleSlugs(limit: number = 50): Promise<string[]> {
  try {
    const result = await newsService.getPublishedArticles(1, limit);
    return result.articles.map(article => article.slug);
  } catch (error) {
    console.error('Error fetching news slugs:', error);
    return [];
  }
}

/**
 * Batch process static generation with concurrency control
 */
export async function batchGenerateStatic<T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  options: {
    batchSize?: number;
    delayMs?: number;
    onProgress?: (completed: number, total: number) => void;
  } = {}
) {
  const { batchSize = 10, delayMs = 100, onProgress } = options;

  let completed = 0;
  const total = items.length;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (item) => {
        try {
          await processor(item);
          completed++;
          onProgress?.(completed, total);
        } catch (error) {
          console.error('Error processing item:', item, error);
        }
      })
    );

    // Add delay between batches to avoid overwhelming the server
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Calculate priority score for a property
 */
export function calculatePropertyPriority(property: {
  postcode?: string;
  viewCount?: number;
  lastSalePrice?: number;
  updatedAt?: string;
}): number {
  let score = 0;

  // High traffic postcode
  if (property.postcode) {
    const prefix = property.postcode.split(' ')[0];
    if (ISRConfig.priority.highTrafficPostcodes.includes(prefix)) {
      score += 50;
    }
  }

  // View count
  if (property.viewCount) {
    score += Math.min(property.viewCount / 10, 30);
  }

  // High value property
  if (property.lastSalePrice && property.lastSalePrice > 1000000) {
    score += 20;
  }

  // Recently updated
  if (property.updatedAt) {
    const daysSinceUpdate = Math.floor(
      (Date.now() - new Date(property.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceUpdate < 7) {
      score += 10;
    }
  }

  return score;
}

/**
 * Check if a page should be statically generated at build time
 */
export function shouldGenerateAtBuild(
  type: keyof typeof ISRConfig.buildLimits,
  priority: number = 0
): boolean {
  const limit = ISRConfig.buildLimits[type];

  if (limit === 'all') return true;
  if (typeof limit === 'number' && priority > 50) return true;

  return false;
}