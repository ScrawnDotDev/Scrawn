import { getPostgresDB } from "../db";
import { sessionsTable } from "../schema";
import { eq, and, sql } from "drizzle-orm";
import { StorageError } from "../../../../errors/storage";
import { DateTime } from "luxon";
import type { UserId } from "../../../../config/identifiers";
import type { PgTransaction } from "drizzle-orm/pg-core";

export async function updateSessionStatus(
  checkoutSessionId: string,
  status: "failed" | "succeeded",
  txn: PgTransaction<any, any, any>
): Promise<boolean> {
  try {
    const result = await txn
      .update(sessionsTable)
      .set({ processed: status })
      .where(
        and(
          eq(sessionsTable.sessionId, checkoutSessionId),
          eq(sessionsTable.processed, "pending")
        )
      );
    return (result.count ?? 0) > 0;
  } catch (e) {
    throw StorageError.queryFailed(
      "Failed to update session status",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

export async function checkIfExistingCheckoutLink(
  txn: PgTransaction<any, any, any>,
  userId: UserId,
  mode: "test" | "production",
  project_id: string
): Promise<string | undefined> {
  try {
    if (!txn) {
      throw StorageError.invalidData("Missing transaction in checkIfExisting");
    }

    const [existing] = await txn
      .select()
      .from(sessionsTable)
      .where(
        and(
          eq(sessionsTable.userId, userId),
          eq(sessionsTable.processed, "pending"),
          eq(sessionsTable.mode, mode),
          eq(sessionsTable.project_id, project_id),
          sql`${sessionsTable.createdAt} > ${DateTime.utc().minus({ hours: 24 }).toISO()}`
        )
      )
      .limit(1)
      .for("update");

    return existing?.proxy_link_id;
  } catch (e) {
    if (e instanceof Error && e.name === "StorageError") {
      throw e;
    }

    throw StorageError.queryFailed(
      "Failed to check for existing session",
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
  project_id: string,
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
        project_id: project_id,
      })
      .returning({ proxy_link_id: sessionsTable.proxy_link_id });

    if (!insertResult[0]) {
      throw StorageError.emptyResult("Session insert returned no record");
    }

    const insertedId = insertResult[0].proxy_link_id;
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
      .where(eq(sessionsTable.proxy_link_id, sessionId))
      .limit(1);

    return session?.checkoutUrl;
  } catch (e) {
    throw StorageError.queryFailed(
      "Failed to get checkout URL",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}
