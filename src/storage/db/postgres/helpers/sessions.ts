import { getPostgresDB } from "../db";
import { sessionsTable } from "../schema";
import { eq } from "drizzle-orm";
import { StorageError } from "../../../../errors/storage";
import type { DateTime } from "luxon";
import type { UserId } from "../../../../config/identifiers";
import type { PgTransaction } from "drizzle-orm/pg-core";

export async function markSessionProcessed(
  checkoutSessionId: string,
  txn?: PgTransaction<any, any, any>
): Promise<void> {
  const db = txn ?? getPostgresDB();

  try {
    await db
      .update(sessionsTable)
      .set({ processed: true })
      .where(eq(sessionsTable.sessionId, checkoutSessionId));
  } catch (e) {
    throw StorageError.queryFailed(
      "Failed to mark session as processed",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

export async function handleAddSession(
  userId: UserId,
  sessionId: string,
  billedUpto: DateTime,
  apiKeyId: string,
  mode: "test" | "production",
  checkoutUrl: string,
  txn?: PgTransaction<any, any, any>
): Promise<{ id: string }> {
  const connectionObject = txn ?? getPostgresDB();

  try {
    if (!sessionId || sessionId.trim().length === 0) {
      throw StorageError.invalidData("Missing sessionId in handleAddSession");
    }

    const billedUptoStr = billedUpto.toISO();
    if (!billedUptoStr) {
      throw StorageError.invalidTimestamp("billedUpto.toISO() returned falsy");
    }

    const insertResult = await connectionObject
      .insert(sessionsTable)
      .values({
        userId: userId,
        sessionId: sessionId,
        billed_upto: billedUptoStr,
        apiKeyId: apiKeyId,
        mode: mode,
        checkoutUrl: checkoutUrl,
      })
      .returning({ id: sessionsTable.id });

    if (!insertResult[0]) {
      throw StorageError.emptyResult("Session insert returned no record");
    }

    const insertedId = insertResult[0].id;
    if (!insertedId) {
      throw StorageError.emptyResult("Session insert returned null id");
    }

    return { id: insertedId };
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "type" in e &&
      (e as any).name === "StorageError"
    ) {
      throw e;
    }

    if (e instanceof Error && e.message.includes("unique")) {
      throw StorageError.constraintViolation(
        `Session with sessionId ${sessionId} already exists`,
        e
      );
    }

    throw StorageError.insertFailed(
      "Failed to insert session",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

export async function getSessionByCheckoutId(
  checkoutSessionId: string
): Promise<typeof sessionsTable.$inferSelect | undefined> {
  const db = getPostgresDB();

  try {
    const [session] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.sessionId, checkoutSessionId))
      .limit(1);

    return session ?? undefined;
  } catch (e) {
    throw StorageError.queryFailed(
      "Failed to get session by checkout ID",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

export async function getCheckoutUrl(
  sessionId: string
): Promise<string | undefined> {
  const db = getPostgresDB();

  try {
    const [session] = await db
      .select({ checkoutUrl: sessionsTable.checkoutUrl })
      .from(sessionsTable)
      .where(eq(sessionsTable.id, sessionId))
      .limit(1);

    return session?.checkoutUrl;
  } catch (e) {
    throw StorageError.queryFailed(
      "Failed to get checkout URL",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}
