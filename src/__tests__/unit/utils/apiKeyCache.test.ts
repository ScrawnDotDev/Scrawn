import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { apiKeyCache } from "../../../utils/apiKeyCache";

describe("apiKeyCache", () => {
  let originalNow: () => number;

  beforeEach(() => {
    originalNow = Date.now;
    apiKeyCache.clear();
  });

  afterEach(() => {
    // Restore Date.now if mocked
    (Date as any).now = originalNow;
  });

  it("returns null when key is not cached", () => {
    const result = apiKeyCache.get("missing-hash");
    expect(result).toBeNull();
  });

  it("stores and retrieves API key data", () => {
    const now = Date.now();
    (Date as any).now = () => now;

    const expiresAt = new Date(now + 10 * 60 * 1000).toISOString();

    apiKeyCache.set("hash-1", {
      id: "api-key-id-1",
      expiresAt,
    });

    const cached = apiKeyCache.get("hash-1");
    expect(cached).not.toBeNull();
    expect(cached?.id).toBe("api-key-id-1");
    expect(cached?.expiresAt).toBe(expiresAt);
  });

  it("evicts entry when cache TTL expires", () => {
    const base = Date.now();
    (Date as any).now = () => base;

    const expiresAt = new Date(base + 60 * 60 * 1000).toISOString(); // 1h in future

    apiKeyCache.set("hash-ttl", {
      id: "ttl-id",
      expiresAt,
    });

    // Advance time by > 5 minutes TTL (cacheTTLMinutes = 5)
    const later = base + 6 * 60 * 1000;
    (Date as any).now = () => later;

    const cached = apiKeyCache.get("hash-ttl");
    expect(cached).toBeNull();

    const stats = apiKeyCache.getStats();
    expect(stats.size).toBe(0);
  });

  it("evicts entry when API key itself has expired", () => {
    const base = Date.now();
    (Date as any).now = () => base;

    const expiredAt = new Date(base - 1000).toISOString(); // already expired

    apiKeyCache.set("hash-expired", {
      id: "expired-id",
      expiresAt: expiredAt,
    });

    const cached = apiKeyCache.get("hash-expired");
    expect(cached).toBeNull();

    const stats = apiKeyCache.getStats();
    expect(stats.size).toBe(0);
  });

  it("deletes specific key from cache", () => {
    const now = Date.now();
    const expiresAt = new Date(now + 60 * 60 * 1000).toISOString();

    apiKeyCache.set("hash-1", { id: "1", expiresAt });
    apiKeyCache.set("hash-2", { id: "2", expiresAt });

    apiKeyCache.delete("hash-1");

    expect(apiKeyCache.get("hash-1")).toBeNull();
    expect(apiKeyCache.get("hash-2")).not.toBeNull();
  });

  it("clear() removes all entries", () => {
    const now = Date.now();
    const expiresAt = new Date(now + 60 * 60 * 1000).toISOString();

    apiKeyCache.set("hash-1", { id: "1", expiresAt });
    apiKeyCache.set("hash-2", { id: "2", expiresAt });

    apiKeyCache.clear();

    expect(apiKeyCache.get("hash-1")).toBeNull();
    expect(apiKeyCache.get("hash-2")).toBeNull();
    const stats = apiKeyCache.getStats();
    expect(stats.size).toBe(0);
  });

  it("returns correct cache statistics", () => {
    const now = Date.now();
    const expiresAt = new Date(now + 60 * 60 * 1000).toISOString();

    apiKeyCache.set("hash-1", { id: "1", expiresAt });
    apiKeyCache.set("hash-2", { id: "2", expiresAt });

    const stats = apiKeyCache.getStats();
    expect(stats.size).toBe(2);
    expect(stats.maxSize).toBe(1000);
    expect(stats.ttlMinutes).toBe(5);
  });
});
