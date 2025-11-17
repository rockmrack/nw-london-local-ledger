/**
 * ISR (Incremental Static Regeneration) Configuration
 * Centralized configuration for all ISR-related settings
 */

export const ISRConfig = {
  // Revalidation intervals (in seconds)
  revalidation: {
    areas: 86400,      // 24 hours
    properties: 21600, // 6 hours
    planning: 3600,    // 1 hour
    news: 10800,       // 3 hours
    homepage: 43200,   // 12 hours
    static: 604800,    // 7 days
  },

  // Build-time generation limits
  buildLimits: {
    areas: 'all',           // Generate all areas at build time
    properties: 1000,       // Top 1000 properties
    planning: 100,          // Recent 100 planning applications
    news: 50,              // Recent 50 news articles
  },

  // Fallback behavior
  fallback: {
    areas: false,          // 404 if not pre-generated
    properties: 'blocking', // Wait for generation
    planning: 'blocking',   // Wait for generation
    news: 'blocking',      // Wait for generation
  },

  // Priority scoring for static generation
  priority: {
    highTrafficPostcodes: [
      'NW1', 'NW3', 'NW6', 'NW8', // Central areas with high traffic
    ],
    popularAreas: [
      'hampstead', 'primrose-hill', 'st-johns-wood', 'belsize-park',
      'west-hampstead', 'kilburn', 'queens-park', 'swiss-cottage',
    ],
  },

  // On-demand revalidation tags
  tags: {
    all: 'all-content',
    areas: 'area-content',
    properties: 'property-content',
    planning: 'planning-content',
    news: 'news-content',
  },
} as const;

export type ISRConfigType = typeof ISRConfig;