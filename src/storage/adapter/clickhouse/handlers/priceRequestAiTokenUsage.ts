import { DateTime } from "luxon";
import type { UserId } from "../../../../config/identifiers";
import type { AuthContext } from "../../../../context/auth";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { runClickHousePriceQuery } from "../utils";

const VALUE_EXPR =
  "JSONExtractInt(metrics, 'debit_amount', 'input') + JSONExtractInt(metrics, 'debit_amount', 'input_cache') + JSONExtractInt(metrics, 'debit_amount', 'output_cache') + JSONExtractInt(metrics, 'debit_amount', 'output')";
// See priceRequestBasicUsage for why FINAL and ingested_timestamp are used.
const BASE_QUERY = `SELECT sum(${VALUE_EXPR}) as total FROM ai_token_usage_events FINAL WHERE project_id = {projectId:String} AND user_id = {userId:String} AND mode = {mode:String} AND ingested_timestamp < {before:DateTime64(3, 'UTC')}`;
const WINDOW_QUERY = `SELECT sum(${VALUE_EXPR}) as total FROM ai_token_usage_events FINAL WHERE project_id = {projectId:String} AND user_id = {userId:String} AND mode = {mode:String} AND ingested_timestamp >= {lastBilled:DateTime64(3, 'UTC')} AND ingested_timestamp < {before:DateTime64(3, 'UTC')}`;

export async function handlePriceRequestAiTokenUsage(
  userId: UserId,
  beforeTimestamp: DateTime,
  auth: AuthContext,
  txn?: PgTransaction<any, any, any>
): Promise<number> {
  return runClickHousePriceQuery(
    userId,
    beforeTimestamp,
    BASE_QUERY,
    WINDOW_QUERY,
    "AI_TOKEN_USAGE",
    auth,
    txn
  );
}
