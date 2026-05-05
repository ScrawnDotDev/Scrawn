import { getPostgresDB } from "../../../db/postgres/db";
import { eventsTable, aiTokenUsageEventsTable } from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import { type SqlRecord } from "../../../../interface/event/Event";
import type { UserId } from "../../../../config/identifiers";
import { DateTime } from "luxon";
import { User } from "../../../../events/RawEvents/User";
import {
  validateAndPrepareTimestamp,
  executeInTransaction,
} from "./addEventUtils";
import { handleAddUser } from "./addUser";

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
      const reported_timestamp = await validateAndPrepareTimestamp(
        event_data.reported_timestamp
      );

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

    return await executeInTransaction(
      connectionObject,
      `storing ${events.length} AI_TOKEN_USAGE event(s)`,
      async (txn) => {
        const uniqueUserIds = Array.from(
          new Set(aggregatedEvents.map((event) => event.userId))
        );

        for (const userId of uniqueUserIds) {
          const userEvent = new User({ id: userId });
          await handleAddUser(userEvent.serialize().SQL);
        }

        const eventValues = aggregatedEvents.map((aggEvent) => ({
          reported_timestamp: aggEvent.reported_timestamp,
          ingested_timestamp: DateTime.utc().toString(),
          userId: aggEvent.userId,
          api_keyId: apiKeyId,
        }));

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
      }
    );
}
