import { getPostgresDB } from "../../../db/postgres/db";
import { eventsTable, sdkCallEventsTable } from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import { type SqlRecord } from "../../../../interface/event/Event";
import { insertEventWithBaseData, executeInTransaction } from "./addEventUtils";

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
      const eventID = await insertEventWithBaseData(txn, event_data, apiKeyId);

      try {
        await txn.insert(sdkCallEventsTable).values({
          id: eventID.id,
          type: event_data.data.sdkCallType,
          debitAmount: event_data.data.debitAmount,
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