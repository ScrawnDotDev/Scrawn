import { StorageError } from "../../errors/storage";
import type { ServerlessFunctionCallEventType } from "../../interface/event/Event";
import type { IEventRepository } from "../adapters/sql/IEventRepository";
import { SQLAdapterFactory } from "./SQLAdapter";
import { EventRepositoryFactory } from "./SQLRepository";

/**
 * Abstract base handler for SERVERLESS_FUNCTION_CALL events
 * Contains all common logic; database-specific parts are injected via abstract methods
 * Each database implementation only needs to implement 4 template methods
 */
export abstract class BaseServerlessFunctionCallHandler {
  /**
   * Handle SERVERLESS_FUNCTION_CALL event storage
   * Uses injected database-specific implementations
   */
  async handle(
    event: ServerlessFunctionCallEventType,
    dbData: any,
  ): Promise<void> {
    try {
      // Validate debit amount exists
      if (!event.data || event.data.debitAmount === undefined) {
        throw this.createError(
          "constraintViolation",
          "debitAmount is required",
        );
      }

      // Convert timestamp using database-specific logic
      const reportedTimestamp = this.convertTimestamp(event.reported_timestamp);

      if (!reportedTimestamp) {
        throw this.createError("invalidData", "Failed to convert timestamp");
      }

      // Execute transaction with database-specific connection
      await this.executeTransaction(event, reportedTimestamp);
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }

      const err = error instanceof Error ? error : new Error(String(error));
      console.error("Error handling serverless function call event:", err);
      throw this.createError(
        "queryFailed",
        `Transaction failed: ${err.message}`,
      );
    }
  }

  /**
   * Execute the database transaction
   * Uses injected repository for database operations
   */
  private async executeTransaction(
    event: ServerlessFunctionCallEventType,
    reportedTimestamp: string,
  ): Promise<void> {
    try {
      const repository = this.getRepository();

      await this.executeInTransaction(async (txn: any) => {
        try {
          // Step 1: Insert or skip user if already exists
          await repository.insertOrSkipUser(txn, event.userId);

          // Step 2: Insert event and retrieve ID
          const eventID = await repository.insertEvent(
            txn,
            reportedTimestamp,
            event.userId,
          );

          // Step 3: Insert serverless function call event details
          await repository.insertServerlessFunctionCallEventDetails(
            txn,
            eventID,
            event.data.debitAmount,
          );

          console.log(
            `Successfully stored serverless function call event: ${eventID} for user ${event.userId}`,
          );
        } catch (txnError) {
          if (txnError instanceof StorageError) {
            throw txnError;
          }
          const err =
            txnError instanceof Error ? txnError : new Error(String(txnError));
          throw this.createError(
            "queryFailed",
            `Transaction error: ${err.message}`,
          );
        }
      });
    } catch (transactionError) {
      if (transactionError instanceof StorageError) {
        throw transactionError;
      }

      const err =
        transactionError instanceof Error
          ? transactionError
          : new Error(String(transactionError));

      throw this.createError(
        "queryFailed",
        `Transaction failed: ${err.message}`,
      );
    }
  }

  /**
   * Get the database connection
   * Implemented by subclasses for database-specific initialization
   */
  protected getDatabase(): any {
    return SQLAdapterFactory.getConnector();
  }

  /**
   * Get the event repository
   * Implemented by subclasses with database-specific repository
   */
  protected getRepository(): IEventRepository {
    return EventRepositoryFactory.getRepository();
  }

  /**
   * Execute code within a transaction
   * Implemented by subclasses for database-specific transaction handling
   */
  protected async executeInTransaction(
    callback: (txn: any) => Promise<void>,
  ): Promise<void> {
    const db = await this.getDatabase();
    await db.transaction(async (txn: any) => {
      await callback(txn);
    });
  }

  /**
   * Convert timestamp to database-specific format
   * Implemented by subclasses for database-specific timestamp handling
   */
  protected convertTimestamp(dt: any): string | null {
    try {
      // Try ISO format first, then SQL, then toString as fallback
      return dt.toISO() || dt.toSQL() || dt.toString();
    } catch (error) {
      console.error("Failed to convert timestamp to string:", error);
      return null;
    }
  }

  /**
   * Create an error with database-specific error handling
   * Implemented by subclasses for database-specific error types
   * Returns Error type since subclasses may throw StorageError or PostgresStorageError
   */
  protected createError(type: string, message: string): Error {
    switch (type) {
      case "constraintViolation":
        return StorageError.constraintViolation(message);
      case "invalidData":
        return StorageError.invalidData(message);
      case "queryFailed":
        return StorageError.queryFailed(message);
      default:
        return StorageError.queryFailed(message);
    }
  }
}
