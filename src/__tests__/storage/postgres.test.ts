import { describe, it, expect, beforeEach, vi } from "vitest";
import { getPostgresDB } from "../../storage/postgres";

// We need to clear the module cache between tests to reset the singleton
vi.stubGlobal("DATABASE_URL", undefined);

describe("getPostgresDB", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should throw error when DATABASE_URL is not defined", async () => {
    const { getPostgresDB: getDb } = await import("../../storage/postgres");
    expect(() => getDb()).toThrow("DATABASE_URL is not defined");
  });

  it("should initialize database connection when DATABASE_URL is provided", async () => {
    // Set a valid DATABASE_URL for this test
    const originalUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/testdb";

    try {
      const { getPostgresDB: getDb } = await import("../../storage/postgres");
      const db = getDb(process.env.DATABASE_URL);
      expect(db).toBeDefined();
      expect(db).toHaveProperty("query");
    } finally {
      process.env.DATABASE_URL = originalUrl;
    }
  });

  it("should return the same database instance on multiple calls", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/testdb";

    try {
      const { getPostgresDB: getDb } = await import("../../storage/postgres");
      const db1 = getDb(process.env.DATABASE_URL);
      const db2 = getDb(process.env.DATABASE_URL);
      expect(db1).toBe(db2);
    } finally {
      delete process.env.DATABASE_URL;
    }
  });

  it("should accept DATABASE_URL as parameter", async () => {
    const testUrl = "postgres://user:pass@localhost:5432/testdb";
    const { getPostgresDB: getDb } = await import("../../storage/postgres");
    const db = getDb(testUrl);
    expect(db).toBeDefined();
  });
});
