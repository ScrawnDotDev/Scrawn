import { getClickHouseDB } from "../../db/clickhouse";
import { logger } from "../../../errors/logger";

const SDK_CALL_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS sdk_call_events (
  id UUID DEFAULT generateUUIDv4(),
  user_id String,
  api_key_id Nullable(String),
  mode String,
  reported_timestamp DateTime64(3, 'UTC'),
  ingested_timestamp DateTime64(3, 'UTC') DEFAULT now64(3, 'UTC'),
  sdk_call_type String,
  debit_amount Int64
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
  input_tokens Int64,
  output_tokens Int64,
  input_debit_amount Int64,
  output_debit_amount Int64
) ENGINE = MergeTree()
ORDER BY (user_id, reported_timestamp)
`;

const PAYMENT_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS payment_events (
  id UUID DEFAULT generateUUIDv4(),
  user_id String,
  mode String,
  reported_timestamp DateTime64(3, 'UTC'),
  ingested_timestamp DateTime64(3, 'UTC') DEFAULT now64(3, 'UTC'),
  credit_amount Int64
) ENGINE = MergeTree()
ORDER BY (user_id, reported_timestamp)
`;

export async function runClickHouseMigrations(): Promise<void> {
  const client = getClickHouseDB();

  await client.command({ query: SDK_CALL_EVENTS_TABLE });
  logger.lifecycle("ClickHouse: sdk_call_events table ensured");

  await client.command({ query: AI_TOKEN_USAGE_EVENTS_TABLE });
  logger.lifecycle("ClickHouse: ai_token_usage_events table ensured");

  await client.command({ query: PAYMENT_EVENTS_TABLE });
  logger.lifecycle("ClickHouse: payment_events table ensured");
}
