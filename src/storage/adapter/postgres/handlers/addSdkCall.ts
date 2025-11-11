import { getPostgresDB } from "../../../db/postgres/db";
import {
  usersTable,
  eventsTable,
  sdkCallEventsTable,
} from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import { type BaseEventMetadata } from "../../../../interface/event/Event";
import { type UserId } from "../../../../config/identifiers";

export async function handleAddSdkCall(
  event_data: BaseEventMetadata<"SDK_CALL"> & {
    userId: UserId;
  },
  apiKeyId: string,
): Promise<{ id: string } | void> {
  const connectionObject = getPostgresDB();

  try {
    // Validate event data structure
    if (!event_data.userId) {
      throw StorageError.invalidData("Missing userId in SDK_CALL event data");
    }

    if (!event_data.data) {
      throw StorageError.invalidData("Missing data field in SDK_CALL event");
    }

    if (!event_data.data.sdkCallType) {
      throw StorageError.invalidData(
        "Missing sdkCallType in SDK_CALL event data",
      );
    }

    if (typeof event_data.data.debitAmount !== "number") {
      throw StorageError.invalidData(
        `Invalid debitAmount type: expected number, got ${typeof event_data.data.debitAmount}`,
      );
    }

    // Allow negative debit amounts for refunds/credits

    console.log(
      `[PostgresAdapter] Processing SDK_CALL event for user: ${event_data.userId}`,
    );

    await connectionObject.transaction(async (txn) => {
      // Insert user if not exists
      try {
        await txn
          .insert(usersTable)
          .values({
            id: event_data.userId,
          })
          .onConflictDoNothing();

        console.log(
          `[PostgresAdapter] User ${event_data.userId} ensured in database`,
        );
      } catch (e) {
        console.error(
          `[PostgresAdapter] User insert failed for ${event_data.userId}:`,
          e,
        );

        if (
          e instanceof Error &&
          e.message.includes('Failed query: insert into "users" ("id")')
        ) {
          // User already exists, ignore the error
          console.log(
            `[PostgresAdapter] User ${event_data.userId} already exists, continuing`,
          );
        } else {
          throw StorageError.userInsertFailed(
            event_data.userId,
            e instanceof Error ? e : new Error(String(e)),
          );
        }
      }

      // Validate and prepare timestamp
      let reported_timestamp;
      try {
        reported_timestamp = event_data.reported_timestamp.toISO();
        console.log(
          `[PostgresAdapter] Reported timestamp: ${reported_timestamp}`,
        );
      } catch (e) {
        console.error(
          "[PostgresAdapter] Failed to convert timestamp to ISO:",
          e,
        );
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

      // Validate API key ID
      if (!apiKeyId) {
        throw StorageError.missingApiKeyId();
      }

      if (typeof apiKeyId !== "string" || apiKeyId.trim().length === 0) {
        throw StorageError.invalidData(
          `Invalid API key ID format: ${typeof apiKeyId}`,
        );
      }

      // Insert event
      let eventID;
      try {
        [eventID] = await txn
          .insert(eventsTable)
          .values({
            reported_timestamp,
            userId: event_data.userId,
            api_keyId: apiKeyId,
          })
          .returning({ id: eventsTable.id });
      } catch (e) {
        console.error(
          `[PostgresAdapter] Event insert failed for user ${event_data.userId}:`,
          e,
        );
        throw StorageError.eventInsertFailed(
          `Failed to insert event for user ${event_data.userId}`,
          e instanceof Error ? e : new Error(String(e)),
        );
      }

      if (!eventID) {
        throw StorageError.emptyResult("Event insert returned no ID");
      }

      if (!eventID.id) {
        throw StorageError.emptyResult(
          "Event insert returned object without id field",
        );
      }

      console.log(`[PostgresAdapter] Event inserted with ID: ${eventID.id}`);

      // Insert SDK call event
      try {
        const sdkData = event_data;
        await txn.insert(sdkCallEventsTable).values({
          id: eventID.id,
          type: sdkData.data.sdkCallType,
          debitAmount: sdkData.data.debitAmount,
        });

        console.log(
          `[PostgresAdapter] SDK call event inserted successfully with debit amount: ${sdkData.data.debitAmount}`,
        );
      } catch (e) {
        console.error(
          `[PostgresAdapter] SDK call event insert failed for event ID ${eventID.id}:`,
          e,
        );
        throw StorageError.insertFailed(
          `Failed to insert SDK call event for event ID ${eventID.id}`,
          e instanceof Error ? e : new Error(String(e)),
        );
      }

      return { id: eventID };
    });

    console.log(
      `[PostgresAdapter] SDK_CALL event processing completed successfully`,
    );
  } catch (e) {
    console.error("[PostgresAdapter] SDK_CALL transaction failed:", e);

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
      "Transaction failed while storing SDK_CALL event",
      e instanceof Error ? e : new Error(String(e)),
    );
  }
}
