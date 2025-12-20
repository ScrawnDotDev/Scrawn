import { getPostgresDB } from "../../../db/postgres/db";
import { apiKeysTable } from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import { type SqlRecord } from "../../../../interface/event/Event";
import { logger } from "../../../../errors/logger";

const OPERATION = "AddKey";

export async function handleAddKey(
  event_data: SqlRecord<"ADD_KEY">,
): Promise<{ id: string } | void> {
  const connectionObject = getPostgresDB();

  try {
    // Validate ADD_KEY event data
    if (!event_data.data) {
      throw StorageError.invalidData("Missing data field in ADD_KEY event");
    }

    if (!event_data.data.name || typeof event_data.data.name !== "string") {
      throw StorageError.invalidData(
        "Invalid or missing 'name' in ADD_KEY event data",
      );
    }

    if (!event_data.data.key || typeof event_data.data.key !== "string") {
      throw StorageError.invalidData(
        "Invalid or missing 'key' in ADD_KEY event data",
      );
    }

    if (event_data.data.key.trim().length === 0) {
      throw StorageError.invalidData("API key cannot be empty");
    }

    logger.logOperationInfo(OPERATION, "start", "Processing ADD_KEY event", {
      keyName: event_data.data.name,
    });

    return await connectionObject.transaction(async (txn) => {
      // Validate and prepare timestamp
      let reported_timestamp;
      try {
        reported_timestamp = event_data.reported_timestamp.toISO();
      } catch (e) {
        throw StorageError.invalidTimestamp(
          "Failed to convert reported_timestamp to ISO format",
          e instanceof Error ? e : new Error(String(e)),
        );
      }

      if (!reported_timestamp || reported_timestamp.trim().length === 0) {
        throw StorageError.invalidTimestamp(
          "Timestamp is undefined or empty after conversion",
        );
      }

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
        // Check for unique constraint violations
        if (
          e instanceof Error &&
          (e.message.includes("unique") || e.message.includes("duplicate"))
        ) {
          throw StorageError.constraintViolation(
            `API key with name '${keyData.data.name}' or key value already exists`,
            e,
          );
        }

        throw StorageError.insertFailed(
          `Failed to insert API key '${keyData.data.name}'`,
          e instanceof Error ? e : new Error(String(e)),
        );
      }

      if (!apiKeyRecord) {
        throw StorageError.emptyResult("API key insert returned no record");
      }

      if (!apiKeyRecord.id) {
        throw StorageError.emptyResult(
          "API key insert returned object without id field",
        );
      }

      logger.logOperationInfo(
        OPERATION,
        "key_inserted",
        "API key inserted successfully",
        { apiKeyId: apiKeyRecord.id, keyName: keyData.data.name },
      );

      return apiKeyRecord;
    });
  } catch (e) {
    // Use duck typing instead of instanceof to work with mocked modules
    if (
      e &&
      typeof e === "object" &&
      "type" in e &&
      (e as any).name === "StorageError"
    ) {
      throw e;
    }

    throw StorageError.transactionFailed(
      "Transaction failed while storing ADD_KEY event",
      e instanceof Error ? e : new Error(String(e)),
    );
  }
}
