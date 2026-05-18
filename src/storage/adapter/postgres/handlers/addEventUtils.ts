import { StorageError } from "../../../../errors/storage";
import { DateTime } from "luxon";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PgDatabase } from "drizzle-orm/pg-core";

export {
  userExists,
  ensureUserExists,
} from "../../../db/postgres/helpers/users";

export type TransactionFn<T> = (
  txn: PgTransaction<any, any, any>
) => Promise<T>;

export async function executeInTransaction<T>(
  connectionObject: PgDatabase<any, any>,
  operationName: string,
  fn: TransactionFn<T>
): Promise<T> {
  try {
    return await connectionObject.transaction(fn);
  } catch (e) {
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
