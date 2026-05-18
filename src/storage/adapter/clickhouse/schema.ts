import { getClickHouseDB } from "../../db/clickhouse";
import { logger } from "../../../errors/logger";
import { innerProduct } from "drizzle-orm";

const BASIC_USAGE_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS basic_usage_events (
  id UUID DEFAULT generateUUIDv4(),
  user_id String,
  api_key_id Nullable(String),
  mode String,
  reported_timestamp DateTime64(3, 'UTC'),
  ingested_timestamp DateTime64(3, 'UTC') DEFAULT now64(3, 'UTC'),
  type String,
  debit_amount Int64,
  metadata JSON
) ENGINE = MergeTree()
ORDER BY (user_id, reported_timestamp)
`;

const AI_TOKEN_USAGE_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS ai_token_usage_events (
  id UUID DEFAULT generateUUIDv4(),
  user_id String,
  api_key_id Nullable(String),
  mode String,
  reported_timestamp DateTime64(3, 'UTC'),
  ingested_timestamp DateTime64(3, 'UTC') DEFAULT now64(3, 'UTC'),
  model String,
  provider String,
  metrics String,
  metadata JSON
) ENGINE = MergeTree()
ORDER BY (user_id, reported_timestamp)
`;

export async function runClickHouseMigrations(): Promise<void> {
  const client = getClickHouseDB();

  await client.command({ query: BASIC_USAGE_EVENTS_TABLE });
  logger.lifecycle("ClickHouse: basic_usage_events table ensured");

  await client.command({ query: AI_TOKEN_USAGE_EVENTS_TABLE });
  logger.lifecycle("ClickHouse: ai_token_usage_events table ensured");
}
