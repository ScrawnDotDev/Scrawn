import { getPostgresDB } from "../../../db/postgres/db";
import { eventsTable, paymentEventsTable } from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import { type SqlRecord } from "../../../../interface/event/Event";
import { DateTime } from "luxon";
import * as Sentry from "@sentry/bun";
import {
  validateAndPrepareTimestamp,
  insertEvent,
  ensureUserExists,
  executeInTransaction,
  userExists,
} from "./addEventUtils";

export async function handleAddPayment(
  event_data: SqlRecord<"PAYMENT">,
  apiKeyId?: string
): Promise<{ id: string } | void> {
  const connectionObject = getPostgresDB();

  const creditAmount = event_data?.data?.creditAmount;

  if (
    creditAmount === undefined ||
    creditAmount === null ||
    typeof creditAmount !== "number" ||
    !Number.isFinite(creditAmount) ||
    creditAmount < 0
  ) {
    throw StorageError.invalidData(
      `Invalid creditAmount: must be a positive finite number, got ${String(
        creditAmount
      )}`
    );
  }

  return await executeInTransaction(
    connectionObject,
    "storing PAYMENT event",
    async (txn) => {
      const exists = await userExists(event_data.userId);
      if (!exists) {
        Sentry.captureMessage(
          `Payment received for non-existent user, auto-creating: ${event_data.userId}`,
          {
            level: "warning",
            contexts: {
              payment: {
                userId: event_data.userId,
                creditAmount: creditAmount,
                reportedTimestamp: event_data.reported_timestamp?.toISO(),
              },
            },
          }
        );
      }

      await ensureUserExists(event_data.userId);

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
        await txn.insert(paymentEventsTable).values({
          id: eventID.id,
          creditAmount: event_data.data.creditAmount,
        });
      } catch (e) {
        throw StorageError.insertFailed(
          `Failed to insert payment event for event ID ${eventID.id}`,
          e instanceof Error ? e : new Error(String(e))
        );
      }

      return { id: eventID.id };
    }
  );
}
