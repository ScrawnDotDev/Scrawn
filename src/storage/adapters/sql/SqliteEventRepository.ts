import {
  eventsTable,
  serverlessFunctionCallEventsTable,
  usersTable,
} from "../../db/sqlite/schema";
import { StorageError } from "../../../errors/storage";
import type { IEventRepository } from "./IEventRepository";

export class SqliteEventRepository implements IEventRepository {
  /**
   * Insert a new user or skip if already exists (duplicate key)
   */
  async insertOrSkipUser(txn: any, userId: string): Promise<void> {
    try {
      await txn.insert(usersTable).values({
        id: userId,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Only ignore duplicate key errors for users
      if (
        err.message.includes("UNIQUE constraint failed") ||
        err.message.includes("duplicate")
      ) {
        console.log(`User ${userId} already exists, skipping user insertion`);
        return;
      }

      // Any other error is a real problem
      throw StorageError.queryFailed(
        `Failed to insert user: ${err.message}`,
        err,
      );
    }
  }

  /**
   * Insert an event and return the generated ID
   */
  async insertEvent(
    txn: any,
    reportedTimestamp: string,
    userId: string,
  ): Promise<string> {
    try {
      const eventId = crypto.randomUUID();
      await txn.insert(eventsTable).values({
        id: eventId,
        reported_timestamp: reportedTimestamp,
        userId: userId,
      });

      return eventId;
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }

      const err = error instanceof Error ? error : new Error(String(error));
      throw StorageError.queryFailed(
        `Failed to insert event: ${err.message}`,
        err,
      );
    }
  }

  /**
   * Insert serverless function call event-specific details
   */
  async insertServerlessFunctionCallEventDetails(
    txn: any,
    eventId: string,
    debitAmount: number,
  ): Promise<void> {
    try {
      await txn.insert(serverlessFunctionCallEventsTable).values({
        id: eventId,
        debitAmount: debitAmount,
      });
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }

      const err = error instanceof Error ? error : new Error(String(error));
      throw StorageError.queryFailed(
        `Failed to insert serverless function call event details: ${err.message}`,
        err,
      );
    }
  }
}
