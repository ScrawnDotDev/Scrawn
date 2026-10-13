import { DateTime } from "luxon";
import type { UserId } from "../../../../config/identifiers";
import type { AuthContext } from "../../../../context/auth";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { runClickHousePriceQuery } from "../utils";

// Duplicates are rejected at ingestion by the Postgres idempotency claim;
// FINAL is a backstop for any unmerged duplicate rows. The window is keyed
// on ingested_timestamp (database clock, ordered against checkout by the
// user lock) so late/backdated events are not skipped.
const BASE_QUERY =
  "SELECT sum(debit_amount) as total FROM basic_usage_events FINAL WHERE project_id = {projectId:String} AND user_id = {userId:String} AND mode = {mode:String} AND ingested_timestamp < {before:DateTime64(3, 'UTC')}";
const WINDOW_QUERY =
  "SELECT sum(debit_amount) as total FROM basic_usage_events FINAL WHERE project_id = {projectId:String} AND user_id = {userId:String} AND mode = {mode:String} AND ingested_timestamp >= {lastBilled:DateTime64(3, 'UTC')} AND ingested_timestamp < {before:DateTime64(3, 'UTC')}";

export async function handlePriceRequestBasicUsage(
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
    "BASIC_USAGE",
    auth,
    txn
  );
}
