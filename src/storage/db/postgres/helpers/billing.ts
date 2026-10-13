import { getPostgresDB } from "../db";
import { usersTable, eventIdempotencyKeysTable } from "../schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { StorageError } from "../../../../errors/storage";
import type { PgTransaction } from "drizzle-orm/pg-core";

/**
 * Ordering protocol between event ingestion and checkout pricing.
 *
 * Ingestion holds a SHARE lock on the user row while it stamps and stores an
 * event; pricing takes an UPDATE lock on the same row before reading the
 * cutoff and summing events. Pricing therefore waits for in-flight ingestion
 * to commit, and any event that commits after pricing has read is stamped
 * after the cutoff, so it falls into the next billing window instead of
 * being skipped forever.
 *
 * Timestamps on both sides come from the database clock so that multiple
 * server instances with skewed clocks still agree on the ordering.
 */

/**
 * Takes SHARE locks on the given users (in a stable order to avoid
 * deadlocks). The users must already exist.
 */
export async function lockUsersForIngestion(
  projectId: string,
  userIds: string[],
  txn: PgTransaction<any, any, any>
): Promise<void> {
  const ids = Array.from(new Set(userIds)).sort();
  if (ids.length === 0) return;

  try {
    await txn
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(eq(usersTable.projectId, projectId), inArray(usersTable.id, ids))
      )
      .orderBy(usersTable.id)
      .for("share");
  } catch (e) {
    throw StorageError.queryFailed(
      "Failed to lock users for ingestion",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

/**
 * Takes an UPDATE lock on the user so no new events can be stamped for them
 * until the pricing transaction ends. The user must already exist.
 */
export async function lockUserForBilling(
  projectId: string,
  userId: string,
  txn: PgTransaction<any, any, any>
): Promise<void> {
  try {
    await txn
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(eq(usersTable.projectId, projectId), eq(usersTable.id, userId))
      )
      .for("update");
  } catch (e) {
    throw StorageError.queryFailed(
      "Failed to lock user for billing",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

/**
 * Reads the database's wall clock (not the transaction start time), so it
 * reflects the moment after any locks taken earlier in the transaction.
 */
export async function getDatabaseNow(
  txn: PgTransaction<any, any, any>
): Promise<DateTime> {
  let raw: unknown;
  try {
    const rows = await txn.execute(
      sql`SELECT to_json(clock_timestamp())#>>'{}' AS now`
    );
    raw = rows[0]?.now;
  } catch (e) {
    throw StorageError.queryFailed(
      "Failed to read database clock",
      e instanceof Error ? e : new Error(String(e))
    );
  }

  const now =
    typeof raw === "string" ? DateTime.fromISO(raw, { zone: "utc" }) : null;
  if (!now || !now.isValid) {
    throw StorageError.invalidTimestamp(
      `Database clock returned an invalid value: ${String(raw)}`
    );
  }
  return now.toUTC();
}

/**
 * Atomically claims idempotency keys for events stored outside Postgres.
 * A concurrent claim for the same key blocks until this transaction ends;
 * if it commits, the other claim is rejected as a duplicate.
 */
export async function claimIdempotencyKeys(
  projectId: string,
  eventTable: "basic_usage_events" | "ai_token_usage_events",
  idempotencyKeys: string[],
  txn?: PgTransaction<any, any, any>
): Promise<void> {
  const keys = Array.from(new Set(idempotencyKeys));
  if (keys.length === 0) return;

  const db = txn ?? getPostgresDB();
  let claimed: Array<{ idempotencyKey: string }>;
  try {
    claimed = await db
      .insert(eventIdempotencyKeysTable)
      .values(
        keys.map((idempotencyKey) => ({
          projectId,
          eventTable,
          idempotencyKey,
        }))
      )
      .onConflictDoNothing()
      .returning({ idempotencyKey: eventIdempotencyKeysTable.idempotencyKey });
  } catch (e) {
    throw StorageError.insertFailed(
      "Failed to claim idempotency keys",
      e instanceof Error ? e : new Error(String(e))
    );
  }

  if (claimed.length !== keys.length) {
    const claimedKeys = new Set(claimed.map((c) => c.idempotencyKey));
    const duplicate = keys.find((k) => !claimedKeys.has(k));
    throw StorageError.constraintViolation(
      `Duplicate idempotency key: ${duplicate}`
    );
  }
}
