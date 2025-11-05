import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  eventsTable,
  serverlessFunctionCallEventsTable,
  usersTable,
} from "../../db/postgres/schema";
import { PostgresStorageError } from "../../../errors/postgres-storage";
import type { IEventRepository } from "./IEventRepository";

export class PostgresEventRepository implements IEventRepository {
  /**
   * Insert a new user or skip if already exists (duplicate key)
   */
  async insertOrSkipUser(
    txn: PgTransaction<any, any>,
    userId: string,
  ): Promise<void> {
    try {
      await txn.insert(usersTable).values({
        id: userId,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Only ignore duplicate key errors for users
      if (err.message.includes("duplicate key value")) {
        console.log(`User ${userId} already exists, skipping user insertion`);
        return;
      }

      // Any other error is a real problem
      throw PostgresStorageError.fromPostgresError(err);
    }
  }

  /**
   * Insert an event and return the generated ID
   */
  async insertEvent(
    txn: PgTransaction<any, any>,
    reportedTimestamp: string,
    userId: string,
  ): Promise<string> {
    try {
      const insertResult = await txn
        .insert(eventsTable)
        .values({
          reported_timestamp: reportedTimestamp,
          userId: userId,
        })
        .returning({ id: eventsTable.id });

      const eventRecord = insertResult[0];

      if (!eventRecord || !eventRecord.id) {
        throw PostgresStorageError.queryFailed(
          "Failed to insert event and retrieve ID - no ID returned from database",
        );
      }

      return eventRecord.id;
    } catch (error) {
      if (error instanceof PostgresStorageError) {
        throw error;
      }

      const err = error instanceof Error ? error : new Error(String(error));
      throw PostgresStorageError.fromPostgresError(err);
    }
  }

  /**
   * Insert serverless function call event-specific details
   */
  async insertServerlessFunctionCallEventDetails(
    txn: PgTransaction<any, any>,
    eventId: string,
    debitAmount: number,
  ): Promise<void> {
    try {
      await txn.insert(serverlessFunctionCallEventsTable).values({
        id: eventId,
        debitAmount: debitAmount,
      });
    } catch (error) {
      if (error instanceof PostgresStorageError) {
        throw error;
      }

      const err = error instanceof Error ? error : new Error(String(error));
      throw PostgresStorageError.fromPostgresError(err);
    }
  }
}
