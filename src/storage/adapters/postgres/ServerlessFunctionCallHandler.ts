import type { PgTransaction } from "drizzle-orm/pg-core";
import { PostgresStorageError } from "../../../errors/postgres-storage";
import type { ServerlessFunctionCallEvent } from "../../../events/ServerlessFunctionCallEvent";
import { EventRepository } from "./EventRepository";
import { getPostgresDB } from "../../postgres";

export class ServerlessFunctionCallHandler {
  /**
   * Handle SERVERLESS_FUNCTION_CALL event storage with validation
   */
  static async handle(
    eventData: ReturnType<ServerlessFunctionCallEvent["serialize"]>["POSTGRES"],
  ): Promise<void> {
    try {
      // Convert timestamp to SQL format
      let reportedTimestamp;
      try {
        reportedTimestamp = eventData.reported_timestamp.toSQL();
      } catch (error) {
        throw PostgresStorageError.invalidTimestamp(
          `Failed to convert timestamp to SQL: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : new Error(String(error)),
        );
      }

      if (!reportedTimestamp) {
        throw PostgresStorageError.invalidTimestamp(
          "reported_timestamp conversion resulted in undefined value",
        );
      }

      // Validate debit amount exists
      if (!eventData.data || eventData.data.debitAmount === undefined) {
        throw PostgresStorageError.notNullViolation("debitAmount");
      }

      // Execute transaction
      await this.executeTransaction(eventData, reportedTimestamp);
    } catch (error) {
      if (error instanceof PostgresStorageError) {
        throw error;
      }

      const err = error instanceof Error ? error : new Error(String(error));
      console.error("Error handling serverless function call event:", err);
      throw PostgresStorageError.transactionFailed(err.message, err);
    }
  }

  /**
   * Execute the database transaction for SERVERLESS_FUNCTION_CALL events
   */
  private static async executeTransaction(
    eventData: ReturnType<ServerlessFunctionCallEvent["serialize"]>["POSTGRES"],
    reportedTimestamp: string,
  ): Promise<void> {
    try {
      const db = getPostgresDB();

      await db.transaction(async (txn: PgTransaction<any, any>) => {
        try {
          // Step 1: Insert or skip user if already exists
          await EventRepository.insertOrSkipUser(txn, eventData.userId);

          // Step 2: Insert event and retrieve ID
          const eventID = await EventRepository.insertEvent(
            txn,
            reportedTimestamp,
            eventData.userId,
          );

          // Step 3: Insert serverless function call event details
          await EventRepository.insertServerlessFunctionCallEventDetails(
            txn,
            eventID,
            eventData.data.debitAmount,
          );

          console.log(
            `Successfully stored serverless function call event: ${eventID} for user ${eventData.userId}`,
          );
        } catch (txnError) {
          if (txnError instanceof PostgresStorageError) {
            throw txnError;
          }
          const err =
            txnError instanceof Error ? txnError : new Error(String(txnError));
          throw PostgresStorageError.transactionFailed(
            `Transaction error: ${err.message}`,
            err,
          );
        }
      });
    } catch (transactionError) {
      if (transactionError instanceof PostgresStorageError) {
        throw transactionError;
      }

      const err =
        transactionError instanceof Error
          ? transactionError
          : new Error(String(transactionError));

      // Check if it's a connection error
      if (
        err.message.includes("connection") ||
        err.message.includes("ECONNREFUSED")
      ) {
        throw PostgresStorageError.connectionFailed(err.message, err);
      }

      throw PostgresStorageError.transactionFailed(err.message, err);
    }
  }
}
