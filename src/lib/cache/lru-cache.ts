/**
 * LRU (Least Recently Used) In-Memory Cache Implementation
 * Provides fast L1 caching with automatic expiration and size limits
 */

interface CacheEntry<T> {
  value: T;
  expiry?: number;
  size: number;
  tags?: Set<string>;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  currentSize: number;
  itemCount: number;
  hitRate: number;
  missRate: number;
}

export class LRUCache<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private currentSize = 0;
  private defaultTTL?: number;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  // Cleanup timer for expired entries
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(options: {
    maxSize?: number;
    maxItems?: number;
    defaultTTL?: number;
    cleanupInterval?: number;
  } = {}) {
    this.maxSize = options.maxSize || 100 * 1024 * 1024; // 100MB default
    this.defaultTTL = options.defaultTTL;

    // Start cleanup interval for expired entries
    const cleanupMs = options.cleanupInterval || 60000; // 1 minute default
    this.cleanupInterval = setInterval(() => this.cleanupExpired(), cleanupMs);

    // Limit by item count if specified
    if (options.maxItems) {
      this.maxSize = options.maxItems * 1024; // Rough estimate 1KB per item
    }
  }

  /**
   * Get value from cache
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (entry.expiry && entry.expiry < Date.now()) {
      this.delete(key);
      this.stats.misses++;
      return null;
    }

    // Move to front (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set value in cache with optional TTL and tags
   */
  set(
    key: string,
    value: T,
    options: {
      ttl?: number;
      tags?: string[];
      size?: number;
    } = {}
  ): void {
    const ttl = options.ttl ?? this.defaultTTL;
    const expiry = ttl ? Date.now() + ttl * 1000 : undefined;
    const size = options.size || this.estimateSize(value);
    const tags = options.tags ? new Set(options.tags) : undefined;

    // Remove old entry if exists
    if (this.cache.has(key)) {
      this.delete(key);
    }

    // Check if we need to evict entries to make room
    while (this.currentSize + size > this.maxSize && this.cache.size > 0) {
      this.evictOldest();
    }

    const entry: CacheEntry<T> = { value, expiry, size, tags };
    this.cache.set(key, entry);
    this.currentSize += size;
  }

  /**
   * Delete entry from cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSize -= entry.size;
      return this.cache.delete(key);
    }
    return false;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }

  /**
   * Delete all entries with a specific tag
   */
  deleteByTag(tag: string): number {
    let deleted = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags?.has(tag)) {
        this.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  /**
   * Delete all entries matching pattern
   */
  deleteByPattern(pattern: string): number {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    let deleted = 0;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  /**
   * Check if key exists
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check expiry
    if (entry.expiry && entry.expiry < Date.now()) {
      this.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      currentSize: this.currentSize,
      itemCount: this.cache.size,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      missRate: total > 0 ? this.stats.misses / total : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
    };
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get total memory size
   */
  memorySize(): number {
    return this.currentSize;
  }

  /**
   * Batch get multiple keys
   */
  mget(keys: string[]): Map<string, T | null> {
    const result = new Map<string, T | null>();
    for (const key of keys) {
      result.set(key, this.get(key));
    }
    return result;
  }

  /**
   * Batch set multiple key-value pairs
   */
  mset(entries: Array<{
    key: string;
    value: T;
    ttl?: number;
    tags?: string[];
  }>): void {
    for (const entry of entries) {
      this.set(entry.key, entry.value, {
        ttl: entry.ttl,
        tags: entry.tags,
      });
    }
  }

  /**
   * Warm cache with data
   */
  async warm(
    loader: () => Promise<Array<{
      key: string;
      value: T;
      ttl?: number;
      tags?: string[];
    }>>
  ): Promise<number> {
    try {
      const entries = await loader();
      this.mset(entries);
      return entries.length;
    } catch (error) {
      console.error('Error warming cache:', error);
      return 0;
    }
  }

  /**
   * Destroy cache and cleanup
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }

  // Private methods

  private evictOldest(): void {
    const firstKey = this.cache.keys().next().value;
    if (firstKey) {
      this.delete(firstKey);
      this.stats.evictions++;
    }
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiry && entry.expiry < now) {
        this.delete(key);
      }
    }
  }

  private estimateSize(value: T): number {
    // Rough estimate of object size in bytes
    const str = JSON.stringify(value);
    return str.length * 2; // UTF-16 encoding
  }
}

// Singleton instance for global use
let globalCache: LRUCache | null = null;

export function getGlobalLRUCache(): LRUCache {
  if (!globalCache) {
    globalCache = new LRUCache({
      maxItems: parseInt(process.env.L1_CACHE_MAX_ITEMS || '5000'),
      defaultTTL: parseInt(process.env.L1_CACHE_DEFAULT_TTL || '300'), // 5 minutes
      cleanupInterval: 60000, // 1 minute
    });
  }
  return globalCache;
}

export function destroyGlobalLRUCache(): void {
  if (globalCache) {
    globalCache.destroy();
    globalCache = null;
  }
}