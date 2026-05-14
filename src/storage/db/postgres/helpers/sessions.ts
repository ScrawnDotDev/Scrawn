import { getPostgresDB } from "../db";
import { sessionsTable } from "../schema";
import { eq } from "drizzle-orm";
import { StorageError } from "../../../../errors/storage";
import type { DateTime } from "luxon";
import type { UserId } from "../../../../config/identifiers";

export async function handleAddSession(
  userId: UserId,
  sessionId: string,
  billedUpto: DateTime,
  mode: "test" | "production",
  checkoutUrl?: string
): Promise<{ id: string }> {
  const connectionObject = getPostgresDB();

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
        userId: userId as string,
        sessionId: sessionId,
        billed_upto: billedUptoStr,
        mode: mode,
        checkoutUrl: checkoutUrl,
      } as any)
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

export type SessionRow = {
  id: string;
  userId: string | null;
  billed_upto: string | null;
  processed: boolean | null;
  mode: "production" | "test" | null;
};

export async function getSessionByCheckoutId(
  checkoutSessionId: string
): Promise<SessionRow | undefined> {
  const db = getPostgresDB();

  try {
    const [session] = await db
      .select({
        id: sessionsTable.id,
        userId: sessionsTable.userId,
        billed_upto: sessionsTable.billed_upto,
        processed: sessionsTable.processed,
        mode: sessionsTable.mode,
      })
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
