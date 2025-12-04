import { getPostgresDB } from "../../../db/postgres/db";
import {
  usersTable,
  eventsTable,
  paymentEventsTable,
} from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import { type BaseEventMetadata } from "../../../../interface/event/Event";
import { type UserId } from "../../../../config/identifiers";

export async function handleAddPayment(
  event_data: BaseEventMetadata<"PAYMENT"> & {
    userId: UserId;
  },
  apiKeyId?: string,
): Promise<{ id: string } | void> {
  const connectionObject = getPostgresDB();

  try {
    if (event_data.data.creditAmount <= 0) {
      throw StorageError.invalidData(
        `Invalid creditAmount: must be positive, got ${event_data.data.creditAmount}`,
      );
    }

    console.log(
      `[PostgresAdapter] Processing PAYMENT event for user: ${event_data.userId}`,
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

      // Insert event (apiKeyId is optional for webhook events)
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

      console.log(`[PostgresAdapter] Event inserted with ID: ${eventID.id}`);

      // Insert payment event
      try {
        await txn.insert(paymentEventsTable).values({
          id: eventID.id,
          creditAmount: event_data.data.creditAmount,
        });

        console.log(
          `[PostgresAdapter] Payment event inserted successfully with credit amount: ${event_data.data.creditAmount}`,
        );
      } catch (e) {
        console.error(
          `[PostgresAdapter] Payment event insert failed for event ID ${eventID.id}:`,
          e,
        );
        throw StorageError.insertFailed(
          `Failed to insert payment event for event ID ${eventID.id}`,
          e instanceof Error ? e : new Error(String(e)),
        );
      }

      return { id: eventID };
    });

    console.log(
      `[PostgresAdapter] PAYMENT event processing completed successfully`,
    );
  } catch (e) {
    console.error("[PostgresAdapter] PAYMENT transaction failed:", e);

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
      "Transaction failed while storing PAYMENT event",
      e instanceof Error ? e : new Error(String(e)),
    );
  }
}
