import { getPostgresDB } from "../../../db/postgres/db";
import {
  usersTable,
  eventsTable,
  sdkCallEventsTable,
} from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import { type SqlRecord } from "../../../../interface/event/Event";
import { logger } from "../../../../errors/logger";

const OPERATION = "AddSdkCall";

export async function handleAddSdkCall(
  event_data: SqlRecord<"SDK_CALL">,
  apiKeyId: string,
): Promise<{ id: string } | void> {
  const connectionObject = getPostgresDB();

  try {
    logger.logOperationInfo(OPERATION, "start", "Processing SDK_CALL event", {
      userId: event_data.userId,
      apiKeyId,
    });

    // Validate debit amount is not negative
    const debitAmount = event_data.data.debitAmount;
    if (typeof debitAmount === "number" && debitAmount < 0) {
      throw StorageError.insertFailed(
        `Negative debit amount not allowed for SDK call for user ${event_data.userId}`,
        new Error(`debitAmount ${debitAmount} is negative`),
      );
    }

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

      // Insert SDK call event
      try {
        const sdkData = event_data;

        await txn.insert(sdkCallEventsTable).values({
          id: eventID.id,
          type: sdkData.data.sdkCallType,
          debitAmount: sdkData.data.debitAmount,
        });

        logger.logOperationInfo(
          OPERATION,
          "sdk_call_inserted",
          "SDK call event inserted successfully",
          {
            eventId: eventID.id,
            debitAmount: sdkData.data.debitAmount,
            userId: event_data.userId,
          },
        );
      } catch (e) {
        throw StorageError.insertFailed(
          `Failed to insert SDK call event for event ID ${eventID.id}`,
          e instanceof Error ? e : new Error(String(e)),
        );
      }

      return { id: eventID };
    });

    logger.logOperationInfo(
      OPERATION,
      "completed",
      "SDK_CALL transaction completed successfully",
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
      "Transaction failed while storing SDK_CALL event",
      e instanceof Error ? e : new Error(String(e)),
    );
  }
}
