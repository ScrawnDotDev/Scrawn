import { getPostgresDB } from "../../../db/postgres/db";
import { basicUsageEventsTable } from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import { type SqlRecordOf } from "../../../../interface/event/Event";
import { sql } from "drizzle-orm";
import { ensureUserExists } from "../../../db/postgres/helpers/users";
import { lockUsersForIngestion } from "../../../db/postgres/helpers/billing";
import type { AuthContext } from "../../../../context/auth";
import {
  validateAndPrepareTimestamp,
  executeInTransaction,
} from "./addEventUtils";

export async function handleAddBasicUsage(
  event_data: SqlRecordOf<"BASIC_USAGE">,
  auth: AuthContext
): Promise<{ id: string } | void> {
  const connectionObject = getPostgresDB();

  const debitAmount = event_data.data.debitAmount;
  if (typeof debitAmount === "number" && debitAmount < 0) {
    throw StorageError.insertFailed(
      `Negative debit amount not allowed for basic usage event for user ${event_data.userId}`,
      new Error(`debitAmount ${debitAmount} is negative`)
    );
  }

  return await executeInTransaction(
    connectionObject,
    "storing BASIC_USAGE event",
    async (txn) => {
      const ensurePromise = await ensureUserExists(
        auth.projectId,
        event_data.userId,
        txn
      );
      await lockUsersForIngestion(auth.projectId, [event_data.userId], txn);

      const reportedTimestamp = await validateAndPrepareTimestamp(
        event_data.reported_timestamp
      );

      try {
        const [result] = await txn
          .insert(basicUsageEventsTable)
          .values({
            projectId: auth.projectId,
            eventId: event_data.eventId,
            idempotencyKey: event_data.idempotencyKey,
            reportedTimestamp,
            // Database clock, read after the user lock (see helpers/billing).
            ingestedTimestamp: sql`clock_timestamp()`,
            userId: event_data.userId,
            apiKeyId: auth.apiKeyId,
            mode: auth.mode as "production" | "test",
            type: event_data.data.basicUsageType,
            debitAmount: event_data.data.debitAmount,
            metadata: event_data.data.metadata ?? {},
          })
          .returning({ id: basicUsageEventsTable.id });

        if (!result) {
          throw StorageError.emptyResult(
            "Basic usage event insert returned no ID"
          );
        }

        try {
          await ensurePromise;
        } catch (e) {
          throw StorageError.insertFailed(
            "Failed to ensure user exists for basic usage event",
            e instanceof Error ? e : new Error(String(e))
          );
        }

        return { id: result.id };
      } catch (e) {
        throw StorageError.insertFailed(
          "Failed to insert basic usage event",
          e instanceof Error ? e : new Error(String(e))
        );
      }
    }
  );
}
