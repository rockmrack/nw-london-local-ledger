/**
 * Cloudflare Edge Cache Configuration
 * Defines cache rules, TTLs, and strategies for different route patterns
 */

export interface CacheRule {
  pattern: string | RegExp;
  edge: number;              // Edge TTL in seconds
  browser: number;           // Browser TTL in seconds
  tags: string[];           // Cache tags for invalidation
  staleWhileRevalidate?: number;
  immutable?: boolean;
  bypassConditions?: {
    headers?: string[];
    cookies?: string[];
    queryParams?: string[];
  };
  vary?: string[];          // Vary headers
  customKey?: (request: Request) => string;
}

/**
 * Cache rules configuration
 */
export const cacheRules: CacheRule[] = [
  // Planning data - 1 hour at edge
  {
    pattern: /^\/api\/planning/,
    edge: 3600,
    browser: 300,
    tags: ['planning', 'api'],
    staleWhileRevalidate: 7200,
    vary: ['Accept', 'Accept-Language'],
  },

  // Property data - 30 minutes at edge
  {
    pattern: /^\/api\/properties/,
    edge: 1800,
    browser: 180,
    tags: ['property', 'api'],
    staleWhileRevalidate: 3600,
    vary: ['Accept', 'Accept-Language'],
  },

  // Area data - 24 hours at edge
  {
    pattern: /^\/api\/areas/,
    edge: 86400,
    browser: 3600,
    tags: ['area', 'api', 'static-data'],
    staleWhileRevalidate: 172800,
    vary: ['Accept', 'Accept-Language'],
  },

  // School data - 24 hours at edge
  {
    pattern: /^\/api\/schools/,
    edge: 86400,
    browser: 3600,
    tags: ['schools', 'api', 'static-data'],
    staleWhileRevalidate: 172800,
  },

  // Transport data - 24 hours at edge
  {
    pattern: /^\/api\/transport/,
    edge: 86400,
    browser: 3600,
    tags: ['transport', 'api', 'static-data'],
    staleWhileRevalidate: 172800,
  },

  // Demographics data - 24 hours at edge
  {
    pattern: /^\/api\/demographics/,
    edge: 86400,
    browser: 3600,
    tags: ['demographics', 'api', 'static-data'],
    staleWhileRevalidate: 172800,
  },

  // Crime data - 1 hour at edge
  {
    pattern: /^\/api\/crime/,
    edge: 3600,
    browser: 300,
    tags: ['crime', 'api'],
    staleWhileRevalidate: 7200,
  },

  // Search API - 5 minutes at edge
  {
    pattern: /^\/api\/search/,
    edge: 300,
    browser: 60,
    tags: ['search', 'api'],
    staleWhileRevalidate: 600,
    customKey: (request) => {
      const url = new URL(request.url);
      const query = url.searchParams.get('q')?.toLowerCase().trim() || '';
      const type = url.searchParams.get('type') || 'all';
      const page = url.searchParams.get('page') || '1';
      return `search:${type}:${query}:${page}`;
    },
  },

  // GraphQL queries - 10 minutes at edge
  {
    pattern: /^\/api\/graphql/,
    edge: 600,
    browser: 120,
    tags: ['graphql', 'api'],
    staleWhileRevalidate: 1200,
    bypassConditions: {
      headers: ['X-No-Cache', 'X-GraphQL-Mutation'],
    },
    customKey: (request) => {
      // Only cache queries, not mutations
      const body = request.body ? JSON.parse(request.body as any) : {};
      if (body.query?.trim().startsWith('mutation')) {
        return 'no-cache';
      }
      const queryHash = hashQuery(body.query || '');
      const varsHash = hashVariables(body.variables || {});
      return `graphql:${queryHash}:${varsHash}`;
    },
  },

  // User-specific data - 10 minutes at edge with auth key
  {
    pattern: /^\/api\/user/,
    edge: 600,
    browser: 120,
    tags: ['user', 'api'],
    staleWhileRevalidate: 1200,
    vary: ['Authorization'],
    customKey: (request) => {
      const auth = request.headers.get('Authorization');
      const userId = extractUserId(auth);
      return `user:${userId}:${request.url}`;
    },
  },

  // AI Assistant responses - 30 minutes at edge
  {
    pattern: /^\/api\/ai/,
    edge: 1800,
    browser: 300,
    tags: ['ai', 'api'],
    staleWhileRevalidate: 3600,
    customKey: (request) => {
      const url = new URL(request.url);
      const prompt = url.searchParams.get('prompt') || '';
      const context = url.searchParams.get('context') || '';
      return `ai:${hashQuery(prompt)}:${hashQuery(context)}`;
    },
  },

  // Static assets - 1 year at edge
  {
    pattern: /^\/_next\/static/,
    edge: 31536000,
    browser: 31536000,
    tags: ['static', 'assets'],
    immutable: true,
  },

  // Images - 30 days at edge
  {
    pattern: /^\/(images|media|uploads)/,
    edge: 2592000,
    browser: 86400,
    tags: ['images', 'media'],
    staleWhileRevalidate: 5184000,
  },

  // Fonts - 1 year at edge
  {
    pattern: /\.(woff|woff2|ttf|otf|eot)$/,
    edge: 31536000,
    browser: 31536000,
    tags: ['fonts', 'static'],
    immutable: true,
  },

  // CSS/JS bundles - 1 year at edge
  {
    pattern: /\.(css|js)$/,
    edge: 31536000,
    browser: 31536000,
    tags: ['bundles', 'static'],
    immutable: true,
  },

  // HTML pages - 5 minutes at edge
  {
    pattern: /\.html$/,
    edge: 300,
    browser: 60,
    tags: ['html', 'pages'],
    staleWhileRevalidate: 600,
  },

  // Root and dynamic pages - 5 minutes at edge
  {
    pattern: /^\/($|[^.]+$)/,
    edge: 300,
    browser: 60,
    tags: ['pages', 'dynamic'],
    staleWhileRevalidate: 600,
    bypassConditions: {
      cookies: ['session', 'auth-token'],
    },
  },
];

/**
 * Get cache rule for a given URL
 */
export function getCacheRule(url: string): CacheRule | null {
  for (const rule of cacheRules) {
    if (typeof rule.pattern === 'string') {
      if (url.startsWith(rule.pattern)) {
        return rule;
      }
    } else if (rule.pattern.test(url)) {
      return rule;
    }
  }
  return null;
}

/**
 * Generate cache control headers
 */
export function generateCacheHeaders(rule: CacheRule): Headers {
  const headers = new Headers();

  // Browser cache control
  const browserDirectives = [`max-age=${rule.browser}`, 'public'];
  if (rule.immutable) {
    browserDirectives.push('immutable');
  }
  if (rule.staleWhileRevalidate) {
    browserDirectives.push(`stale-while-revalidate=${rule.staleWhileRevalidate}`);
  }
  headers.set('Cache-Control', browserDirectives.join(', '));

  // CDN cache control (Cloudflare specific)
  headers.set('CDN-Cache-Control', `max-age=${rule.edge}`);

  // Cache tags for invalidation
  if (rule.tags && rule.tags.length > 0) {
    headers.set('Cache-Tag', rule.tags.join(','));
  }

  // Vary headers for cache key variation
  if (rule.vary && rule.vary.length > 0) {
    headers.set('Vary', rule.vary.join(', '));
  }

  return headers;
}

/**
 * Check if request should bypass cache
 */
export function shouldBypassCache(
  request: Request,
  rule: CacheRule
): boolean {
  // Check method
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return true;
  }

  // Check cache-control headers
  const cacheControl = request.headers.get('cache-control');
  if (cacheControl?.includes('no-cache') || cacheControl?.includes('no-store')) {
    return true;
  }

  // Check pragma header
  if (request.headers.get('pragma') === 'no-cache') {
    return true;
  }

  // Check bypass conditions
  if (rule.bypassConditions) {
    // Check headers
    if (rule.bypassConditions.headers) {
      for (const header of rule.bypassConditions.headers) {
        if (request.headers.has(header)) {
          return true;
        }
      }
    }

    // Check cookies
    if (rule.bypassConditions.cookies) {
      const cookieHeader = request.headers.get('cookie');
      if (cookieHeader) {
        for (const cookie of rule.bypassConditions.cookies) {
          if (cookieHeader.includes(cookie)) {
            return true;
          }
        }
      }
    }

    // Check query parameters
    if (rule.bypassConditions.queryParams) {
      const url = new URL(request.url);
      for (const param of rule.bypassConditions.queryParams) {
        if (url.searchParams.has(param)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Hash a query string for cache key
 */
function hashQuery(query: string): string {
  // Simple hash function for demo (use crypto in production)
  let hash = 0;
  for (let i = 0; i < query.length; i++) {
    const char = query.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

/**
 * Hash variables object for cache key
 */
function hashVariables(variables: any): string {
  const sorted = JSON.stringify(variables, Object.keys(variables).sort());
  return hashQuery(sorted);
}

/**
 * Extract user ID from authorization header
 */
function extractUserId(auth: string | null): string {
  if (!auth) return 'anonymous';

  // Simple extraction (implement proper JWT decoding in production)
  const parts = auth.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer') {
    // Extract user ID from token (simplified)
    return hashQuery(parts[1]).substring(0, 8);
  }

  return 'anonymous';
}

/**
 * Cache warmup configuration
 */
export const cacheWarmupUrls = [
  // High-priority pages
  '/',
  '/properties',
  '/planning',
  '/areas',

  // Area pages (top councils)
  '/areas/barnet',
  '/areas/brent',
  '/areas/camden',
  '/areas/ealing',
  '/areas/harrow',

  // API endpoints
  '/api/properties?limit=20',
  '/api/planning/recent',
  '/api/areas',
  '/api/search?q=&type=all',
];

/**
 * Geographic routing configuration
 */
export const geographicRouting = {
  // Primary origin
  primary: 'https://nw-london.example.com',

  // Regional origins for failover
  regions: {
    'eu-west': 'https://eu.nw-london.example.com',
    'us-east': 'https://us.nw-london.example.com',
    'ap-southeast': 'https://ap.nw-london.example.com',
  },

  // Routing rules
  rules: [
    {
      continents: ['EU'],
      origin: 'eu-west',
    },
    {
      continents: ['NA'],
      origin: 'us-east',
    },
    {
      continents: ['AS', 'OC'],
      origin: 'ap-southeast',
    },
  ],
};

export default {
  cacheRules,
  getCacheRule,
  generateCacheHeaders,
  shouldBypassCache,
  cacheWarmupUrls,
  geographicRouting,
};