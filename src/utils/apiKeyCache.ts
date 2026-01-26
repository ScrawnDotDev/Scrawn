// USING LOCAL CACHING JUST FOR NOW
import { logger } from "../errors/logger";

interface CachedAPIKey {
  id: string;
  expiresAt: string;
  cachedAt: number;
  lastAccessed: number;
}

class APIKeyCache {
  private cache: Map<string, CachedAPIKey>; // Map<hash, CachedAPIKey>
  private cacheTTL: number; // in milliseconds
  private maxSize: number;

  constructor(cacheTTLMinutes: number = 5, maxSize: number = 1000) {
    this.cache = new Map();
    this.cacheTTL = cacheTTLMinutes * 60 * 1000;
    this.maxSize = maxSize;

    // Run cleanup every minute to remove expired cache entries
    setInterval(() => this.cleanup(), 60 * 1000);
  }

  /**
   * Get API key data from cache if it exists and is not expired
   * @param hash - The HMAC-SHA256 hash of the API key
   */
  get(hash: string): CachedAPIKey | null {
    const cached = this.cache.get(hash);

    if (!cached) {
      return null;
    }

    const now = Date.now();

    // Check if cache entry has expired
    if (now - cached.cachedAt > this.cacheTTL) {
      this.cache.delete(hash);
      return null;
    }

    // Check if API key itself has expired
    const keyExpiresAt = new Date(cached.expiresAt).getTime();
    if (now > keyExpiresAt) {
      this.cache.delete(hash);
      return null;
    }

    // Update last accessed time for LRU
    cached.lastAccessed = now;

    return cached;
  }

  /**
   * Set API key data in cache
   * @param hash - The HMAC-SHA256 hash of the API key
   */
  set(hash: string, data: { id: string; expiresAt: string }): void {
    // Check if cache is full and evict LRU entry if needed
    if (this.cache.size >= this.maxSize && !this.cache.has(hash)) {
      this.evictLRU();
    }

    const now = Date.now();
    this.cache.set(hash, {
      id: data.id,
      expiresAt: data.expiresAt,
      cachedAt: now,
      lastAccessed: now,
    });
  }

  /**
   * Remove an API key from cache
   * @param hash - The HMAC-SHA256 hash of the API key
   */
  delete(hash: string): void {
    this.cache.delete(hash);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Evict least recently used entry from cache
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, value] of this.cache.entries()) {
      if (value.lastAccessed < oldestTime) {
        oldestTime = value.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      logger.logDebug(
        `Evicted LRU cache entry (cache full at ${this.maxSize})`,
        {}
      );
    }
  }

  /**
   * Clean up expired cache entries
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, value] of this.cache.entries()) {
      // Remove if cache TTL expired or API key expired
      const keyExpiresAt = new Date(value.expiresAt).getTime();
      if (now - value.cachedAt > this.cacheTTL || now > keyExpiresAt) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.cache.delete(key));

    if (keysToDelete.length > 0) {
      logger.logDebug(
        `Cleaned up ${keysToDelete.length} expired cache entries`,
        {}
      );
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number; ttlMinutes: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMinutes: this.cacheTTL / (60 * 1000),
    };
  }
}

// Export singleton instance
export const apiKeyCache = new APIKeyCache(5, 1000); // 5 minutes TTL, max 1000 entries
