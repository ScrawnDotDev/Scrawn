import { DateTime } from "luxon";
import type { UserId } from "../../../../config/identifiers";
import type { AuthContext } from "../../../../context/auth";
import { runClickHousePriceQuery } from "../utils";

const VALUE_EXPR =
  "JSONExtractInt(metrics, 'debit_amount', 'input') + JSONExtractInt(metrics, 'debit_amount', 'input_cache') + JSONExtractInt(metrics, 'debit_amount', 'output')";
const BASE_QUERY = `SELECT sum(${VALUE_EXPR}) as total FROM ai_token_usage_events WHERE user_id = {userId:String} AND mode = {mode:String} AND project_id = {projectId:String} AND reported_timestamp < {before:DateTime64(3, 'UTC')}`;
const WINDOW_QUERY = `SELECT sum(${VALUE_EXPR}) as total FROM ai_token_usage_events WHERE user_id = {userId:String} AND mode = {mode:String} AND project_id = {projectId:String} AND reported_timestamp > {lastBilled:DateTime64(3, 'UTC')} AND reported_timestamp < {before:DateTime64(3, 'UTC')}`;

export async function handlePriceRequestAiTokenUsage(
  userId: UserId,
  beforeTimestamp: DateTime,
  auth: AuthContext
): Promise<number> {
  return runClickHousePriceQuery(
    userId,
    beforeTimestamp,
    BASE_QUERY,
    WINDOW_QUERY,
    "AI_TOKEN_USAGE",
    auth
  );
}
