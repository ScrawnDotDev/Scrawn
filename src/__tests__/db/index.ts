import type { TestDBAdapter } from "./types";
import { sql } from "drizzle-orm";
import { getPostgresDB } from "../../storage/db/postgres/db";
import { getClickHouseDB } from "../../storage/db/clickhouse";
import { Cache } from "../../utils/cacheStore";

export type { TestDBAdapter, NormalizedBasicUsageEvent } from "./types";

async function resolveAdapter(): Promise<TestDBAdapter> {
  if (process.env.STORAGE_ADAPTER === "clickhouse") {
    const { ClickHouseTestDB } = await import("./clickhouse");
    return new ClickHouseTestDB();
  }
  const { PostgresTestDB } = await import("./postgres");
  return new PostgresTestDB();
}

export const testDB: Promise<TestDBAdapter> = resolveAdapter();

export async function clearDatabase() {
  Cache.getStore("api-keys").clear();
  Cache.getStore("webhook-endpoints").clear();
  const db = getPostgresDB();
  await db.execute(sql`
    TRUNCATE TABLE
      sessions,
      basic_usage_events,
      payment_events,
      ai_token_usage_events,
      api_keys,
      users,
      tags,
      metadata,
      expressions
    RESTART IDENTITY CASCADE
  `);

  if (process.env.STORAGE_ADAPTER === "clickhouse") {
    const ch = getClickHouseDB();
    await ch.command({ query: "TRUNCATE TABLE IF EXISTS basic_usage_events" });
    await ch.command({
      query: "TRUNCATE TABLE IF EXISTS ai_token_usage_events",
    });
  }
}
