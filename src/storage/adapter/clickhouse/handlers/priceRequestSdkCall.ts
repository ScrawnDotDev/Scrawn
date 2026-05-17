import { DateTime } from "luxon";
import type { UserId } from "../../../../config/identifiers";
import { runClickHousePriceQuery } from "../utils";

const BASE_QUERY = "SELECT sum(debit_amount) as total FROM basic_usage_events WHERE user_id = {userId:String} AND mode = {mode:String} AND reported_timestamp < {before:DateTime64(3, 'UTC')}";
const WINDOW_QUERY = "SELECT sum(debit_amount) as total FROM basic_usage_events WHERE user_id = {userId:String} AND mode = {mode:String} AND reported_timestamp > {lastBilled:DateTime64(3, 'UTC')} AND reported_timestamp < {before:DateTime64(3, 'UTC')}";

export async function handlePriceRequestSdkCall(
  userId: UserId,
  beforeTimestamp: DateTime,
  mode: "production" | "test"
): Promise<number> {
  return runClickHousePriceQuery(userId, beforeTimestamp, mode, BASE_QUERY, WINDOW_QUERY, "BASIC_USAGE");
}
