/**
 * Simple In-Memory Cache Service
 * 
 * Provides TTL-based caching for responses and computations.
 */

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class CacheService {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private readonly defaultTtlMs: number;

  constructor(defaultTtlMs: number = 60_000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Get a value from cache if it exists and hasn't expired
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  /**
   * Set a value in cache with optional TTL
   */
  set<T>(key: string, value: T, ttlMs?: number): void {
    const expiresAt = Date.now() + (ttlMs ?? this.defaultTtlMs);
    this.cache.set(key, { value, expiresAt });
  }

  /**
   * Delete a value from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Check if a key exists and hasn't expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear all expired entries
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  stats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}
