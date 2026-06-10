import { getClickHouseDB } from "../../db/clickhouse";
import { logger } from "../../../errors/logger";

const BASIC_USAGE_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS basic_usage_events (
  id UUID DEFAULT generateUUIDv4(),
  event_id String,
  idempotency_key String,
  user_id String,
  api_key_id Nullable(String),
  project_id String,
  mode String,
  reported_timestamp DateTime64(3, 'UTC'),
  ingested_timestamp DateTime64(3, 'UTC') DEFAULT now64(3, 'UTC'),
  type String,
  debit_amount Int64,
  metadata JSON
) ENGINE = ReplacingMergeTree()
ORDER BY (project_id, idempotency_key, user_id)
`;

const AI_TOKEN_USAGE_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS ai_token_usage_events (
  id UUID DEFAULT generateUUIDv4(),
  event_id String,
  idempotency_key String,
  user_id String,
  api_key_id Nullable(String),
  project_id String,
  mode String,
  reported_timestamp DateTime64(3, 'UTC'),
  ingested_timestamp DateTime64(3, 'UTC') DEFAULT now64(3, 'UTC'),
  model String,
  provider String,
  metrics String,
  metadata JSON
) ENGINE = ReplacingMergeTree()
ORDER BY (project_id, idempotency_key, user_id)
`;

const ADD_PROJECT_ID_BASIC = `
ALTER TABLE basic_usage_events ADD COLUMN IF NOT EXISTS project_id String DEFAULT ''
`;

const ADD_PROJECT_ID_AI_TOKEN = `
ALTER TABLE ai_token_usage_events ADD COLUMN IF NOT EXISTS project_id String DEFAULT ''
`;

export async function runClickHouseMigrations(): Promise<void> {
  const client = getClickHouseDB();

  await client.command({ query: BASIC_USAGE_EVENTS_TABLE });
  logger.lifecycle("ClickHouse: basic_usage_events table ensured");

  await client.command({ query: AI_TOKEN_USAGE_EVENTS_TABLE });
  logger.lifecycle("ClickHouse: ai_token_usage_events table ensured");

  await client.command({ query: ADD_PROJECT_ID_BASIC });
  logger.lifecycle("ClickHouse: basic_usage_events project_id column ensured");

  await client.command({ query: ADD_PROJECT_ID_AI_TOKEN });
  logger.lifecycle(
    "ClickHouse: ai_token_usage_events project_id column ensured"
  );
}
