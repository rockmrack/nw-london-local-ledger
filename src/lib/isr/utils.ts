/**
 * ISR Utility Functions
 * Helper functions for managing ISR and static generation
 */

import { cache } from 'react';
import { ISRConfig } from './config';

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
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  try {
    const response = await fetch(`${baseUrl}/api/areas`, {
      next: { revalidate: ISRConfig.revalidation.areas },
    });

    if (!response.ok) {
      console.error('Failed to fetch areas for static generation');
      return [];
    }

    const data = await response.json();
    return data.areas?.map((area: any) => area.slug) || [];
  } catch (error) {
    console.error('Error fetching area slugs:', error);
    return [];
  }
}

/**
 * Get top property slugs for static generation
 */
export async function getTopPropertySlugs(limit: number = 1000): Promise<string[]> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  try {
    const response = await fetch(
      `${baseUrl}/api/properties?limit=${limit}&sort=views_desc`,
      {
        next: { revalidate: ISRConfig.revalidation.properties },
      }
    );

    if (!response.ok) {
      console.error('Failed to fetch properties for static generation');
      return [];
    }

    const data = await response.json();
    return data.properties?.map((prop: any) => prop.slug) || [];
  } catch (error) {
    console.error('Error fetching property slugs:', error);
    return [];
  }
}

/**
 * Get recent planning application IDs for static generation
 */
export async function getRecentPlanningIds(limit: number = 100): Promise<string[]> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  try {
    const response = await fetch(
      `${baseUrl}/api/planning?limit=${limit}&sort=date_desc`,
      {
        next: { revalidate: ISRConfig.revalidation.planning },
      }
    );

    if (!response.ok) {
      console.error('Failed to fetch planning applications for static generation');
      return [];
    }

    const data = await response.json();
    return data.applications?.map((app: any) => app.reference || app.id) || [];
  } catch (error) {
    console.error('Error fetching planning IDs:', error);
    return [];
  }
}

/**
 * Get news article slugs for static generation
 */
export async function getNewsArticleSlugs(limit: number = 50): Promise<string[]> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  try {
    const response = await fetch(
      `${baseUrl}/api/news?limit=${limit}`,
      {
        next: { revalidate: ISRConfig.revalidation.news },
      }
    );

    if (!response.ok) {
      console.error('Failed to fetch news for static generation');
      return [];
    }

    const data = await response.json();
    return data.articles?.map((article: any) => article.slug) || [];
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