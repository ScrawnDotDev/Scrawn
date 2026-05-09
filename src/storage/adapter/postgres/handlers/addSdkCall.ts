import { getPostgresDB } from "../../../db/postgres/db";
import { eventsTable, sdkCallEventsTable } from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import { type SqlRecord } from "../../../../interface/event/Event";
import { DateTime } from "luxon";
import { StorageAdapterFactory } from "../../../../factory";
import { User } from "../../../../events/RawEvents/User";
import {
  validateAndPrepareTimestamp,
  insertEvent,
  executeInTransaction,
} from "./addEventUtils";

export async function handleAddSdkCall(
  event_data: SqlRecord<"SDK_CALL">,
  apiKeyId: string
): Promise<{ id: string } | void> {
  const connectionObject = getPostgresDB();

  const debitAmount = event_data.data.debitAmount;
  if (typeof debitAmount === "number" && debitAmount < 0) {
    throw StorageError.insertFailed(
      `Negative debit amount not allowed for SDK call for user ${event_data.userId}`,
      new Error(`debitAmount ${debitAmount} is negative`)
    );
  }

  return await executeInTransaction(
    connectionObject,
    "storing SDK_CALL event",
    async (txn) => {
      const userAdapter = await StorageAdapterFactory.getEventStorageAdapter("USER");
      const userEvent = new User({ id: event_data.userId });
      await userAdapter.add(userEvent.serialize());

      const reported_timestamp = await validateAndPrepareTimestamp(
        event_data.reported_timestamp
      );

      const eventID = await insertEvent(txn, {
        reported_timestamp,
        ingested_timestamp: DateTime.utc().toString(),
        userId: event_data.userId,
        api_keyId: apiKeyId,
      });

      try {
        const sdkData = event_data;

        await txn.insert(sdkCallEventsTable).values({
          id: eventID.id,
          type: sdkData.data.sdkCallType,
          debitAmount: sdkData.data.debitAmount,
        });
      } catch (e) {
        throw StorageError.insertFailed(
          `Failed to insert SDK call event for event ID ${eventID.id}`,
          e instanceof Error ? e : new Error(String(e))
        );
      }

      return { id: eventID.id };
    }
  );
}