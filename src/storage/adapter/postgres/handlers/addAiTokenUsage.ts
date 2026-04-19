import { getPostgresDB } from "../../../db/postgres/db";
import {
  usersTable,
  eventsTable,
  aiTokenUsageEventsTable,
} from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import { type SqlRecord } from "../../../../interface/event/Event";
import type { UserId } from "../../../../config/identifiers";

type AggregatedEvent = {
  userId: UserId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputDebitAmount: number;
  outputDebitAmount: number;
  reported_timestamp: string;
};

export async function handleAddAiTokenUsage(
  events: Array<SqlRecord<"AI_TOKEN_USAGE">>,
  apiKeyId: string
): Promise<{ id: string } | void> {
  const connectionObject = getPostgresDB();

  if (events.length === 0) {
    return;
  }

  try {
    // Validate all events before processing
    for (const event_data of events) {
      // Validate input tokens is not negative
      const inputTokens = event_data.data.inputTokens;
      if (typeof inputTokens === "number" && inputTokens < 0) {
        throw StorageError.insertFailed(
          `Negative input tokens not allowed for AI token usage for user ${event_data.userId}`,
          new Error(`inputTokens ${inputTokens} is negative`)
        );
      }

      // Validate output tokens is not negative
      const outputTokens = event_data.data.outputTokens;
      if (typeof outputTokens === "number" && outputTokens < 0) {
        throw StorageError.insertFailed(
          `Negative output tokens not allowed for AI token usage for user ${event_data.userId}`,
          new Error(`outputTokens ${outputTokens} is negative`)
        );
      }

      // Validate input debit amount is not negative
      const inputDebitAmount = event_data.data.inputDebitAmount;
      if (typeof inputDebitAmount === "number" && inputDebitAmount < 0) {
        throw StorageError.insertFailed(
          `Negative input debit amount not allowed for AI token usage for user ${event_data.userId}`,
          new Error(`inputDebitAmount ${inputDebitAmount} is negative`)
        );
      }

      // Validate output debit amount is not negative
      const outputDebitAmount = event_data.data.outputDebitAmount;
      if (typeof outputDebitAmount === "number" && outputDebitAmount < 0) {
        throw StorageError.insertFailed(
          `Negative output debit amount not allowed for AI token usage for user ${event_data.userId}`,
          new Error(`outputDebitAmount ${outputDebitAmount} is negative`)
        );
      }
    }

    // Aggregate events by userId and model
    const aggregationMap = new Map<string, AggregatedEvent>();

    for (const event_data of events) {
      let reported_timestamp;
      try {
        reported_timestamp = event_data.reported_timestamp.toISO();
      } catch (e) {
        throw StorageError.invalidTimestamp(
          "Failed to convert reported_timestamp to ISO format",
          e instanceof Error ? e : new Error(String(e))
        );
      }

      if (!reported_timestamp || reported_timestamp.trim().length === 0) {
        throw StorageError.invalidTimestamp(
          "Timestamp is undefined or empty after conversion"
        );
      }

      const key = `${event_data.userId}:${event_data.data.model}`;
      const existing = aggregationMap.get(key);

      if (existing) {
        // Aggregate with existing entry
        existing.inputTokens += event_data.data.inputTokens;
        existing.outputTokens += event_data.data.outputTokens;
        existing.inputDebitAmount += event_data.data.inputDebitAmount;
        existing.outputDebitAmount += event_data.data.outputDebitAmount;
        // Use the latest timestamp
        if (reported_timestamp > existing.reported_timestamp) {
          existing.reported_timestamp = reported_timestamp;
        }
      } else {
        // Create new aggregated entry
        aggregationMap.set(key, {
          userId: event_data.userId,
          model: event_data.data.model,
          inputTokens: event_data.data.inputTokens,
          outputTokens: event_data.data.outputTokens,
          inputDebitAmount: event_data.data.inputDebitAmount,
          outputDebitAmount: event_data.data.outputDebitAmount,
          reported_timestamp,
        });
      }
    }

    const aggregatedEvents = Array.from(aggregationMap.values());

    await connectionObject.transaction(async (txn) => {
      // Collect unique user IDs
      const uniqueUserIds = Array.from(
        new Set(aggregatedEvents.map((event) => event.userId))
      );

      // Batch insert users if not exists
      try {
        if (uniqueUserIds.length > 0) {
          await txn
            .insert(usersTable)
            .values(uniqueUserIds.map((id) => ({ id })))
            .onConflictDoNothing();
        }
      } catch (e) {
        if (
          e instanceof Error &&
          e.message.includes('Failed query: insert into "users" ("id")')
        ) {
          // Users already exist, ignore the error
        } else {
          throw StorageError.userInsertFailed(
            uniqueUserIds.join(", "),
            e instanceof Error ? e : new Error(String(e))
          );
        }
      }

      // Prepare event values for batch insert
      const eventValues = aggregatedEvents.map((aggEvent) => ({
        reported_timestamp: aggEvent.reported_timestamp,
        userId: aggEvent.userId,
        api_keyId: apiKeyId,
      }));

      // Batch insert events
      let eventIDs;
      try {
        eventIDs = await txn
          .insert(eventsTable)
          .values(eventValues)
          .returning({ id: eventsTable.id });
      } catch (e) {
        throw StorageError.eventInsertFailed(
          `Failed to batch insert ${aggregatedEvents.length} aggregated event(s)`,
          e instanceof Error ? e : new Error(String(e))
        );
      }

      if (!eventIDs || eventIDs.length === 0) {
        throw StorageError.emptyResult("Event insert returned no IDs");
      }

      if (eventIDs.length !== aggregatedEvents.length) {
        throw StorageError.insertFailed(
          `Expected ${aggregatedEvents.length} event IDs but got ${eventIDs.length}`,
          new Error("Event ID count mismatch")
        );
      }

      // Prepare AI token usage values for batch insert
      const aiTokenUsageValues = aggregatedEvents.map((aggEvent, index) => {
        const eventId = eventIDs[index];
        if (!eventId) {
          throw StorageError.insertFailed(
            `Missing event ID at index ${index}`,
            new Error("Event ID is undefined")
          );
        }
        return {
          id: eventId.id,
          model: aggEvent.model,
          inputTokens: aggEvent.inputTokens,
          outputTokens: aggEvent.outputTokens,
          inputDebitAmount: aggEvent.inputDebitAmount,
          outputDebitAmount: aggEvent.outputDebitAmount,
        };
      });

      // Batch insert AI token usage events
      try {
        await txn.insert(aiTokenUsageEventsTable).values(aiTokenUsageValues);
      } catch (e) {
        throw StorageError.insertFailed(
          `Failed to batch insert AI token usage events`,
          e instanceof Error ? e : new Error(String(e))
        );
      }

      const firstEvent = eventIDs[0];
      if (!firstEvent || !firstEvent.id) {
        throw StorageError.insertFailed(
          "Missing or invalid ID for the first inserted event",
          new Error(`Invalid first event ID: ${JSON.stringify(firstEvent)}`)
        );
      }

      return { id: firstEvent.id };
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
      `Transaction failed while storing ${events.length} AI_TOKEN_USAGE event(s)`,
      e instanceof Error ? e : new Error(String(e))
    );
  }
}
