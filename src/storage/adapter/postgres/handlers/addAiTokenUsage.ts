import { getPostgresDB } from "../../../db/postgres/db";
import {
  usersTable,
  eventsTable,
  aiTokenUsageEventsTable,
} from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import { type BaseEventMetadata } from "../../../../interface/event/Event";
import { type UserId } from "../../../../config/identifiers";
import { logger } from "../../../../errors/logger";

const OPERATION = "AddAiTokenUsage";

export async function handleAddAiTokenUsage(
  event_data: BaseEventMetadata<"AI_TOKEN_USAGE"> & {
    userId: UserId;
  },
  apiKeyId: string,
): Promise<{ id: string } | void> {
  const connectionObject = getPostgresDB();

  try {
    logger.logOperationInfo(
      OPERATION,
      "start",
      "Processing AI_TOKEN_USAGE event",
      {
        userId: event_data.userId,
        apiKeyId,
      },
    );

    // Validate input tokens is not negative
    const inputTokens = event_data.data.inputTokens;
    if (typeof inputTokens === "number" && inputTokens < 0) {
      throw StorageError.insertFailed(
        `Negative input tokens not allowed for AI token usage for user ${event_data.userId}`,
        new Error(`inputTokens ${inputTokens} is negative`),
      );
    }

    // Validate output tokens is not negative
    const outputTokens = event_data.data.outputTokens;
    if (typeof outputTokens === "number" && outputTokens < 0) {
      throw StorageError.insertFailed(
        `Negative output tokens not allowed for AI token usage for user ${event_data.userId}`,
        new Error(`outputTokens ${outputTokens} is negative`),
      );
    }

    // Validate input debit amount is not negative
    const inputDebitAmount = event_data.data.inputDebitAmount;
    if (typeof inputDebitAmount === "number" && inputDebitAmount < 0) {
      throw StorageError.insertFailed(
        `Negative input debit amount not allowed for AI token usage for user ${event_data.userId}`,
        new Error(`inputDebitAmount ${inputDebitAmount} is negative`),
      );
    }

    // Validate output debit amount is not negative
    const outputDebitAmount = event_data.data.outputDebitAmount;
    if (typeof outputDebitAmount === "number" && outputDebitAmount < 0) {
      throw StorageError.insertFailed(
        `Negative output debit amount not allowed for AI token usage for user ${event_data.userId}`,
        new Error(`outputDebitAmount ${outputDebitAmount} is negative`),
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

      // Insert AI token usage event
      try {
        const aiData = event_data.data;

        await txn.insert(aiTokenUsageEventsTable).values({
          id: eventID.id,
          model: aiData.model,
          inputTokens: aiData.inputTokens,
          outputTokens: aiData.outputTokens,
          inputDebitAmount: aiData.inputDebitAmount,
          outputDebitAmount: aiData.outputDebitAmount,
        });

        logger.logOperationInfo(
          OPERATION,
          "ai_token_usage_inserted",
          "AI token usage event inserted successfully",
          {
            eventId: eventID.id,
            model: aiData.model,
            inputTokens: aiData.inputTokens,
            outputTokens: aiData.outputTokens,
            inputDebitAmount: aiData.inputDebitAmount,
            outputDebitAmount: aiData.outputDebitAmount,
            userId: event_data.userId,
          },
        );
      } catch (e) {
        throw StorageError.insertFailed(
          `Failed to insert AI token usage event for event ID ${eventID.id}`,
          e instanceof Error ? e : new Error(String(e)),
        );
      }

      return { id: eventID };
    });

    logger.logOperationInfo(
      OPERATION,
      "completed",
      "AI_TOKEN_USAGE transaction completed successfully",
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
      "Transaction failed while storing AI_TOKEN_USAGE event",
      e instanceof Error ? e : new Error(String(e)),
    );
  }
}
