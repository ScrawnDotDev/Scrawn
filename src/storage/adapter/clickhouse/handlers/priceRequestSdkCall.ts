import { getClickHouseDB } from "../../../db/clickhouse";
import { getPostgresDB } from "../../../db/postgres/db";
import { usersTable } from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import type { DateTime } from "luxon";
import type { UserId } from "../../../../config/identifiers";
import { eq } from "drizzle-orm";
import { toClickHouseDateTime } from "../utils";

export async function handlePriceRequestSdkCall(
  userId: UserId,
  beforeTimestamp: DateTime
): Promise<number> {
  const chClient = getClickHouseDB();
  const pgDb = getPostgresDB();

  if (!userId) {
    throw StorageError.invalidData("Missing userId in SDK_CALL price request");
  }

  let lastBilled: string | null = null;
  try {
    const [user] = await pgDb
      .select({ lastBilled: usersTable.last_billed_timestamp })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    lastBilled = user?.lastBilled ?? null;
  } catch {
    lastBilled = null;
  }

  if (!beforeTimestamp.isValid) {
    throw StorageError.invalidTimestamp("beforeTimestamp is not a valid DateTime");
  }
  const beforeTs = toClickHouseDateTime(beforeTimestamp);

  try {
    let query: string;
    const params: Record<string, unknown> = {
      userId,
      before: beforeTs,
    };

    if (lastBilled) {
      query = `SELECT sum(debit_amount) as total FROM sdk_call_events WHERE user_id = {userId:String} AND reported_timestamp > {lastBilled:DateTime64(3, 'UTC')} AND reported_timestamp < {before:DateTime64(3, 'UTC')}`;
      params.lastBilled = lastBilled;
    } else {
      query = `SELECT sum(debit_amount) as total FROM sdk_call_events WHERE user_id = {userId:String} AND reported_timestamp < {before:DateTime64(3, 'UTC')}`;
    }

    const rs = await chClient.query({
      query,
      query_params: params,
      format: "JSONEachRow",
    });
    const data = await rs.json<{ total: string | null }>();

    if (!data || data.length === 0 || !data[0]?.total) {
      return 0;
    }

    const parsed = parseInt(data[0].total);
    return isNaN(parsed) ? 0 : parsed;
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "type" in e &&
      (e as any).name === "StorageError"
    ) {
      throw e;
    }
    throw StorageError.priceCalculationFailed(
      userId,
      e instanceof Error ? e : new Error(String(e))
    );
  }
}
