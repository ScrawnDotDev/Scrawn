import type { DateTime } from "luxon";
import { DateTime as LuxonDateTime } from "luxon";
import { getLastBilledTimestamp } from "../../db/postgres/helpers/sessions";
import { getPostgresDB } from "../../db/postgres/db";
import { ensureUserExists } from "../../db/postgres/helpers/users";
import {
  lockUsersForIngestion,
  claimIdempotencyKeys,
  getDatabaseNow,
} from "../../db/postgres/helpers/billing";
import { executeInTransaction } from "../postgres/handlers/addEventUtils";
import { StorageError } from "../../../errors/storage";
import { getClickHouseDB } from "../../db/clickhouse";
import type { UserId } from "../../../config/identifiers";
import type { AuthContext } from "../../../context/auth";
import type { PgTransaction } from "drizzle-orm/pg-core";

export function toClickHouseDateTime(dt: DateTime): string {
  return dt.toUTC().toFormat("yyyy-MM-dd HH:mm:ss.SSS");
}

/**
 * Runs a ClickHouse insert inside a Postgres transaction that:
 * - claims the events' idempotency keys atomically (ClickHouse has no unique
 *   constraints, and ReplacingMergeTree keeps the *latest* duplicate, so a
 *   concurrent retry would otherwise be billed in a later window),
 * - holds SHARE locks on the users so checkout pricing waits for the insert,
 * - stamps the rows with the database clock read after those locks.
 *
 * If the insert fails the transaction rolls back and the keys are released.
 */
export async function insertWithIngestionClaim<T>(
  auth: AuthContext,
  table: "basic_usage_events" | "ai_token_usage_events",
  userIds: string[],
  idempotencyKeys: string[],
  insert: (ingestedTimestamp: string) => Promise<T>
): Promise<T> {
  return await executeInTransaction(
    getPostgresDB(),
    `storing ${table} event(s)`,
    async (txn) => {
      for (const userId of new Set(userIds)) {
        await ensureUserExists(auth.projectId, userId, txn);
      }
      await lockUsersForIngestion(auth.projectId, userIds, txn);
      await claimIdempotencyKeys(auth.projectId, table, idempotencyKeys, txn);
      const ingestedAt = await getDatabaseNow(txn);
      return await insert(toClickHouseDateTime(ingestedAt));
    }
  );
}

function parsePostgresTimestamp(value: string): DateTime | null {
  const fromSql = LuxonDateTime.fromSQL(value, { zone: "utc" });
  if (fromSql.isValid) return fromSql.toUTC();
  const fromIso = LuxonDateTime.fromISO(value, { zone: "utc" });
  if (fromIso.isValid) return fromIso.toUTC();
  return null;
}

export async function runClickHousePriceQuery(
  userId: UserId,
  beforeTimestamp: DateTime,
  baseQuery: string,
  windowQuery: string,
  eventLabel: string,
  auth: AuthContext,
  txn?: PgTransaction<any, any, any>
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

  if (!auth.mode) {
    throw StorageError.invalidData(
      `Cannot price ${eventLabel} events without a production/test mode`
    );
  }

  // Errors here must propagate: silently falling back to the unbounded
  // query would bill the user for usage they have already paid for.
  // Reuse the caller's transaction: checkout pricing already holds a pooled
  // connection, and asking for a second one can exhaust the pool under load.
  const lastBilled = await getLastBilledTimestamp(
    auth.projectId,
    userId,
    auth.mode,
    txn
  );

  let query = baseQuery;
  const params: Record<string, unknown> = {
    userId,
    before: beforeTs,
  };

  if (lastBilled) {
    const lastBilledDt = parsePostgresTimestamp(lastBilled);
    if (!lastBilledDt) {
      throw StorageError.invalidTimestamp(
        `Unparseable last billed timestamp: ${lastBilled}`
      );
    }
    query = windowQuery;
    params.lastBilled = toClickHouseDateTime(lastBilledDt);
  }

  try {
    params.projectId = auth.projectId;
    params.mode = auth.mode;

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
