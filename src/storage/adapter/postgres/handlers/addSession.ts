import { getPostgresDB } from "../../../db/postgres/db";
import { sessionsTable } from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import type { DateTime } from "luxon";
import type { UserId } from "../../../../config/identifiers";

export async function handleAddSession(
  userId: UserId,
  sessionId: string,
  billedUpto: DateTime
): Promise<{ id: string }> {
  if (!sessionId || sessionId.trim().length === 0) {
    throw StorageError.invalidData("Missing sessionId in handleAddSession");
  }

  const billedUptoStr = billedUpto.toISO();
  if (!billedUptoStr) {
    throw StorageError.invalidTimestamp("billedUpto.toISO() returned falsy");
  }

  const connectionObject = getPostgresDB();

  try {
    const insertResult = await connectionObject
      .insert(sessionsTable)
      .values({
        sessionId: sessionId,
        billed_upto: billedUptoStr,
        userId: userId as string,
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