import { getPostgresDB } from "../../../db/postgres/db";
import {
  usersTable,
  eventsTable,
  paymentEventsTable,
} from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import { type BaseEventMetadata } from "../../../../interface/event/Event";
import { type UserId } from "../../../../config/identifiers";
import { logger } from "../../../../errors/logger";

const OPERATION = "AddPayment";

export async function handleAddPayment(
  event_data: BaseEventMetadata<"PAYMENT"> & {
    userId: UserId;
  },
  apiKeyId?: string,
): Promise<{ id: string } | void> {
  const connectionObject = getPostgresDB();

  try {
    const creditAmount = event_data?.data?.creditAmount;

    // Ensure creditAmount is a finite number and positive
    if (
      creditAmount === undefined ||
      creditAmount === null ||
      typeof creditAmount !== "number" ||
      !Number.isFinite(creditAmount) ||
      creditAmount <= 0
    ) {
      throw StorageError.invalidData(
        `Invalid creditAmount: must be a positive finite number, got ${String(
          creditAmount,
        )}`,
      );
    }

    logger.logOperationInfo(OPERATION, "start", "Processing PAYMENT event", {
      userId: event_data.userId,
      apiKeyId,
    });

    await connectionObject.transaction(async (txn) => {
      // Insert user if not exists
      try {
        await txn
          .insert(usersTable)
          .values({
            id: event_data.userId,
          })
          .onConflictDoNothing();

        logger.logOperationDebug(
          OPERATION,
          "user_ensured",
          "User ensured in database",
          { userId: event_data.userId },
        );
      } catch (e) {
        if (
          e instanceof Error &&
          e.message.includes('Failed query: insert into "users" ("id")')
        ) {
          // User already exists, ignore the error
          logger.logOperationDebug(
            OPERATION,
            "user_exists",
            "User already exists, continuing",
            { userId: event_data.userId },
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
        throw StorageError.eventInsertFailed(
          `Failed to insert event for user ${event_data.userId}`,
          e instanceof Error ? e : new Error(String(e)),
        );
      }

      if (!eventID) {
        throw StorageError.emptyResult("Event insert returned no ID");
      }

      logger.logOperationInfo(
        OPERATION,
        "event_inserted",
        "Event row inserted",
        { eventId: eventID.id, userId: event_data.userId, apiKeyId },
      );

      // Insert payment event
      try {
        await txn.insert(paymentEventsTable).values({
          id: eventID.id,
          creditAmount: event_data.data.creditAmount,
        });

        logger.logOperationInfo(
          OPERATION,
          "payment_inserted",
          "Payment event inserted successfully",
          {
            eventId: eventID.id,
            creditAmount: event_data.data.creditAmount,
            userId: event_data.userId,
          },
        );
      } catch (e) {
        throw StorageError.insertFailed(
          `Failed to insert payment event for event ID ${eventID.id}`,
          e instanceof Error ? e : new Error(String(e)),
        );
      }

      return { id: eventID };
    });

    logger.logOperationInfo(
      OPERATION,
      "completed",
      "PAYMENT transaction completed successfully",
      { userId: event_data.userId, apiKeyId },
    );
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
      "Transaction failed while storing PAYMENT event",
      e instanceof Error ? e : new Error(String(e)),
    );
  }
}
