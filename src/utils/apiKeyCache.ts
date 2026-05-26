import { Cache } from "./cacheStore";
import { DateTime } from "luxon";
import type { ApiKeyRole } from "./keyFormat";

interface CachedAPIKey {
  id: string;
  role: ApiKeyRole;
  mode: "production" | "test" | null;
  expiresAt: string;
}

const store = Cache.getStore<string, CachedAPIKey>("api-keys", {
  max: 1000,
  ttlMs: 5 * 60 * 1000,
  validate: (value) =>
    DateTime.utc() <= DateTime.fromISO(value.expiresAt, { zone: "utc" }),
});

export const apiKeyCache = {
  get: (hash: string) => store.get(hash) ?? null,
  set: (hash: string, data: CachedAPIKey) => store.set(hash, data),
  delete: (hash: string) => store.delete(hash),
  clear: () => store.clear(),
  getStats: () => {
    const stats = store.getStats();
    return {
      size: stats.size,
      maxSize: stats.max,
      ttlMinutes: stats.ttlMs / (60 * 1000),
    };
  },
};
