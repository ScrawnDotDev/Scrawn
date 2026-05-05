import { getPostgresDB } from "../../../db/postgres/db";
import { apiKeysTable } from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import { type SqlRecord } from "../../../../interface/event/Event";
import {
  validateAndPrepareTimestamp,
  executeInTransaction,
} from "./addEventUtils";

export async function handleAddKey(
  event_data: SqlRecord<"ADD_KEY">
): Promise<{ id: string } | void> {
  const connectionObject = getPostgresDB();

  if (!event_data.data) {
    throw StorageError.invalidData("Missing data field in ADD_KEY event");
  }

  if (!event_data.data.name || typeof event_data.data.name !== "string") {
    throw StorageError.invalidData(
      "Invalid or missing 'name' in ADD_KEY event data"
    );
  }

  if (!event_data.data.key || typeof event_data.data.key !== "string") {
    throw StorageError.invalidData(
      "Invalid or missing 'key' in ADD_KEY event data"
    );
  }

  if (event_data.data.key.trim().length === 0) {
    throw StorageError.invalidData("API key cannot be empty");
  }

  return await executeInTransaction(
    connectionObject,
    "storing ADD_KEY event",
    async (txn) => {
      const reported_timestamp = await validateAndPrepareTimestamp(
        event_data.reported_timestamp
      );

      const keyData = event_data;

      let apiKeyRecord;
      try {
        [apiKeyRecord] = await txn
          .insert(apiKeysTable)
          .values({
            name: keyData.data.name,
            key: keyData.data.key,
            expiresAt: keyData.data.expiresAt,
          })
          .returning({ id: apiKeysTable.id });
      } catch (e) {
        if (
          e instanceof Error &&
          (e.message.includes("unique") || e.message.includes("duplicate"))
        ) {
          throw StorageError.constraintViolation(
            `API key with name '${keyData.data.name}' or key value already exists`,
            e
          );
        }

        throw StorageError.insertFailed(
          `Failed to insert API key '${keyData.data.name}'`,
          e instanceof Error ? e : new Error(String(e))
        );
      }

      if (!apiKeyRecord) {
        throw StorageError.emptyResult("API key insert returned no record");
      }

      if (!apiKeyRecord.id) {
        throw StorageError.emptyResult(
          "API key insert returned object without id field"
        );
      }

      return apiKeyRecord;
    }
  );
}
