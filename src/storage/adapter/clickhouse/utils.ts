import type { DateTime } from "luxon";
import { DateTime as LuxonDateTime } from "luxon";
import { getPostgresDB } from "../../db/postgres/db";
import { usersTable } from "../../db/postgres/schema";
import { eq } from "drizzle-orm";
import { StorageError } from "../../../errors/storage";
import { getClickHouseDB } from "../../db/clickhouse";
import type { UserId } from "../../../config/identifiers";
import type { AuthContext } from "../../../context/auth";

export function toClickHouseDateTime(dt: DateTime): string {
  return dt.toUTC().toFormat("yyyy-MM-dd HH:mm:ss.SSS");
}

async function fetchLastBilled(userId: string): Promise<string | null> {
  const pgDb = getPostgresDB();
  try {
    const [user] = await pgDb
      .select({ lastBilled: usersTable.last_billed_timestamp })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    return user?.lastBilled ?? null;
  } catch {
    return null;
  }
}

export async function runClickHousePriceQuery(
  userId: UserId,
  beforeTimestamp: DateTime,
  baseQuery: string,
  windowQuery: string,
  eventLabel: string,
  auth: AuthContext
): Promise<number> {
  const chClient = getClickHouseDB();

  if (!userId) {
    throw StorageError.invalidData(
      `Missing userId in ${eventLabel} price request`
    );
  }

  if (!beforeTimestamp.isValid) {
    throw StorageError.invalidTimestamp(
      "beforeTimestamp is not a valid DateTime"
    );
  }
  const beforeTs = toClickHouseDateTime(beforeTimestamp);

  const lastBilled = await fetchLastBilled(userId);

  try {
    let query: string;
    const params: Record<string, unknown> = {
      userId,
      before: beforeTs,
    };

    if (lastBilled) {
      const lastBilledDt = LuxonDateTime.fromSQL(lastBilled, { zone: "utc" });
      if (lastBilledDt.isValid) {
        query = windowQuery;
        params.lastBilled = toClickHouseDateTime(lastBilledDt);
      } else {
        query = baseQuery;
      }
    } else {
      query = baseQuery;
    }

    params.mode = auth.mode;
    params.projectId = auth.projectId;

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
