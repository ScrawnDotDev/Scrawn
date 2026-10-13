import { getPostgresDB } from "../db";
import { usersTable } from "../schema";
import { eq, and, sql } from "drizzle-orm";
import { StorageError } from "../../../../errors/storage";
import type { PgTransaction } from "drizzle-orm/pg-core";

export async function updateUserBilledTimestamp(
  projectId: string,
  userId: string,
  billedUpto: string,
  txn?: PgTransaction<any, any, any>
): Promise<void> {
  const db = txn ?? getPostgresDB();

  try {
    // Never move the timestamp backwards when an older session is paid late.
    await db
      .update(usersTable)
      .set({
        last_billed_timestamp: sql`GREATEST(${usersTable.last_billed_timestamp}, ${billedUpto}::timestamptz)`,
      })
      .where(
        and(eq(usersTable.projectId, projectId), eq(usersTable.id, userId))
      );
  } catch (e) {
    throw StorageError.queryFailed(
      "Failed to update user billed timestamp",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

export async function userExists(
  projectId: string,
  userId: string
): Promise<boolean> {
  const db = getPostgresDB();
  const result = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.projectId, projectId), eq(usersTable.id, userId)))
    .limit(1);
  return result.length > 0;
}

export async function ensureUserExists(
  projectId: string,
  userId: string,
  txn?: PgTransaction<any, any, any>
): Promise<void> {
  const db = txn ?? getPostgresDB();

  try {
    await db
      .insert(usersTable)
      .values({ id: userId, projectId })
      .onConflictDoNothing({ target: [usersTable.projectId, usersTable.id] });
  } catch (e) {
    throw StorageError.queryFailed(
      "Failed to ensure user exists",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}
