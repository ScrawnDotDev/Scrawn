import type { EventType } from "../interface/event/Event";
import type { PostgresStorageAdapterType } from "../interface/storage/Storage";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  eventsTable,
  serverlessFunctionCallEventsTable,
  usersTable,
} from "../storage/db/schema";
import { getPostgresDB } from "../storage/postgres";
import { PostgresStorageError } from "../errors/postgres-storage";
import { StorageError } from "../errors/storage";
import type { ServerlessFunctionCallEvent } from "./event";

export class PostgresStorageAdapter implements PostgresStorageAdapterType {
  public readonly name = "POSTGRES";
  public connectionObject;

  constructor(public event: EventType) {
    this.connectionObject = getPostgresDB();
  }

  async add(): Promise<void> {
    try {
      console.log(`Storing event in PostgreSQL: ${this.event.serialize()}`);

      // Serialize and validate data
      let serialized;
      try {
        serialized = this.event.serialize();
      } catch (error) {
        throw StorageError.serializationFailed(
          `Failed to serialize event: ${error instanceof Error ? error.message : "Unknown error"}`,
          error as Error,
        );
      }

      // Extract PostgreSQL-specific data
      const postgresData = serialized.POSTGRES;
      if (!postgresData) {
        throw StorageError.invalidData(
          "Event serialization missing POSTGRES data",
        );
      }

      // Route to appropriate handler based on event type
      switch (this.event.type) {
        case "SERVERLESS_FUNCTION_CALL":
          await this.handleServerlessFunctionCall(postgresData);
          break;

        default:
          throw StorageError.unknownEventType(this.event.type);
      }
    } catch (error) {
      // Re-throw StorageError and PostgresStorageError as-is
      if (
        error instanceof StorageError ||
        error instanceof PostgresStorageError
      ) {
        console.error(`[${error.type}] ${error.message}`);
        throw error;
      }

      // Wrap unexpected errors
      console.error("Unexpected error in PostgresStorageAdapter.add():", error);
      throw StorageError.unknown(error as Error);
    }
  }

  /**
   * Handle SERVERLESS_FUNCTION_CALL event storage
   */
  private async handleServerlessFunctionCall(
    eventData: ReturnType<ServerlessFunctionCallEvent["serialize"]>["POSTGRES"],
  ): Promise<void> {
    try {
      // Validate required timestamp
      if (!eventData.reported_timestamp) {
        throw PostgresStorageError.notNullViolation("reported_timestamp");
      }

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
      await this.executeServerlessFunctionCallTransaction(
        eventData,
        reportedTimestamp,
      );
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
  private async executeServerlessFunctionCallTransaction(
    eventData: ReturnType<ServerlessFunctionCallEvent["serialize"]>["POSTGRES"],
    reportedTimestamp: string,
  ): Promise<void> {
    try {
      await this.connectionObject.transaction(
        async (txn: PgTransaction<any, any>) => {
          try {
            // Step 1: Insert or skip user if already exists
            await this.insertOrSkipUser(txn, eventData.userId);

            // Step 2: Insert event and retrieve ID
            const eventID = await this.insertEvent(
              txn,
              reportedTimestamp,
              eventData.userId,
            );

            // Step 3: Insert serverless function call event details
            await this.insertServerlessFunctionCallEventDetails(
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
              txnError instanceof Error
                ? txnError
                : new Error(String(txnError));
            throw PostgresStorageError.transactionFailed(
              `Transaction error: ${err.message}`,
              err,
            );
          }
        },
      );
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

  /**
   * Insert a new user or skip if already exists (duplicate key)
   */
  private async insertOrSkipUser(
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
  private async insertEvent(
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
  private async insertServerlessFunctionCallEventDetails(
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

  /**
   * Check if event type is supported by this adapter
   */
  private isSupportedEventType(eventType: string): boolean {
    const supportedTypes = ["SERVERLESS_FUNCTION_CALL"];
    return supportedTypes.includes(eventType);
  }
}
