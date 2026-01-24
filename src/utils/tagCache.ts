import { Cache } from "./cacheStore";

export const tagCache = Cache.getStore<string, number>("tags", {
  max: 500,
  ttlMs: 10 * 60 * 1000,
});
