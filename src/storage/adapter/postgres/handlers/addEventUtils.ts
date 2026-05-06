import { getPostgresDB } from "../../../db/postgres/db";
import { eventsTable } from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import { DateTime } from "luxon";
import { User } from "../../../../events/RawEvents/User";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { handleAddUser } from "./addUser";

export type TransactionFn<T> = (
  txn: PgTransaction<any, any, any>
) => Promise<T>;

export async function insertEventWithBaseData(
  txn: PgTransaction<any, any, any>,
  event_data: { userId: string; reported_timestamp: DateTime },
  apiKeyId: string | undefined
): Promise<{ id: string }> {
  await ensureUserExists(event_data.userId);

  const reported_timestamp = await validateAndPrepareTimestamp(
    event_data.reported_timestamp
  );

  return await insertEvent(txn, {
    reported_timestamp,
    ingested_timestamp: DateTime.utc().toString(),
    userId: event_data.userId,
    api_keyId: apiKeyId,
  });
}

export async function executeInTransaction<T>(
  connectionObject: PgDatabase<any, any>,
  operationName: string,
  fn: TransactionFn<T>
): Promise<T> {
  try {
    return await connectionObject.transaction(fn);
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "type" in e &&
      (e as any).name === "StorageError"
    ) {
      throw e;
    }

    throw StorageError.transactionFailed(
      `Transaction failed while ${operationName}`,
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

export async function validateAndPrepareTimestamp(
  reported_timestamp: DateTime
): Promise<string> {
  let timestamp: string | null = null;
  try {
    timestamp = reported_timestamp.toISO();
  } catch (e) {
    throw StorageError.invalidTimestamp(
      "Failed to convert reported_timestamp to ISO format",
      e instanceof Error ? e : new Error(String(e))
    );
  }

  if (!timestamp || timestamp.trim().length === 0) {
    throw StorageError.invalidTimestamp(
      "Timestamp is undefined or empty after conversion"
    );
  }

  return timestamp;
}

export type EventInsertValues = {
  reported_timestamp: string;
  ingested_timestamp: string;
  userId: string;
  api_keyId: string | undefined;
};

// fallow-ignore-next-line unused-export
export async function insertEvent(
  txn: PgTransaction<any, any, any>,
  values: EventInsertValues
): Promise<{ id: string }> {
  let eventID;
  try {
    [eventID] = await txn
      .insert(eventsTable)
      .values({
        reported_timestamp: values.reported_timestamp,
        ingested_timestamp: values.ingested_timestamp,
        userId: values.userId,
        api_keyId: values.api_keyId,
      })
      .returning({ id: eventsTable.id });
  } catch (e) {
    throw StorageError.eventInsertFailed(
      `Failed to insert event for user ${values.userId}`,
      e instanceof Error ? e : new Error(String(e))
    );
  }

  if (!eventID) {
    throw StorageError.emptyResult("Event insert returned no ID");
  }

  return { id: eventID.id };
}

// fallow-ignore-next-line unused-export
export async function ensureUserExists(
  userId: string
): Promise<void> {
  const userEvent = new User({ id: userId });
  await handleAddUser(userEvent.serialize().SQL);
}