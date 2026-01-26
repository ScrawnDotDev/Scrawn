export interface CacheConfig<K, V> {
  max: number;
  ttlMs: number;
  validate?: (value: V) => boolean;
}

export const DEFAULT_CACHE_CONFIG: CacheConfig<unknown, unknown> = {
  max: 500,
  ttlMs: 10 * 60 * 1000,
};

export class CacheStore<K, V> {
  private readonly max: number;
  private readonly ttlMs: number;
  private readonly validate?: (value: V) => boolean;
  private readonly store = new Map<K, { value: V; expiresAt: number }>();

  constructor(config: CacheConfig<K, V>) {
    this.max = config.max;
    this.ttlMs = config.ttlMs;
    this.validate = config.validate;
  }

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (this.isExpired(entry.expiresAt) || !this.isValid(entry.value)) {
      this.store.delete(key);
      return undefined;
    }

    this.refreshKey(key, entry);
    return entry.value;
  }

  has(key: K): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;

    if (this.isExpired(entry.expiresAt) || !this.isValid(entry.value)) {
      this.store.delete(key);
      return false;
    }

    return true;
  }

  set(key: K, value: V): void {
    const expiresAt = Date.now() + this.ttlMs;

    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.max) {
      this.evictOldest();
    }

    this.store.set(key, { value, expiresAt });
  }

  delete(key: K): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }

  getStats(): { size: number; max: number; ttlMs: number } {
    return {
      size: this.store.size,
      max: this.max,
      ttlMs: this.ttlMs,
    };
  }

  private isExpired(expiresAt: number): boolean {
    return Date.now() > expiresAt;
  }

  private isValid(value: V): boolean {
    return this.validate ? this.validate(value) : true;
  }

  private refreshKey(key: K, entry: { value: V; expiresAt: number }) {
    this.store.delete(key);
    this.store.set(key, entry);
  }

  private evictOldest() {
    const oldestKey = this.store.keys().next().value;
    if (oldestKey !== undefined) {
      this.store.delete(oldestKey);
    }
  }
}

export class Cache {
  private static stores = new Map<string, CacheStore<any, any>>();

  static getStore<K, V>(
    name: string,
    config?: Partial<CacheConfig<K, V>>,
  ): CacheStore<K, V> {
    const existing = Cache.stores.get(name);
    if (existing) return existing as CacheStore<K, V>;

    const merged: CacheConfig<K, V> = {
      ...(DEFAULT_CACHE_CONFIG as CacheConfig<K, V>),
      ...config,
    };

    const store = new CacheStore<K, V>(merged);
    Cache.stores.set(name, store as CacheStore<any, any>);
    return store;
  }
}
