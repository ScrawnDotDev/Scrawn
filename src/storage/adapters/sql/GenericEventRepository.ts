import type { IEventRepository } from "./IEventRepository";
import { StorageError } from "../../../errors/storage";
import { type EventRepositoryType } from "../../handlers/SQLRepository";
import type { TransactionType } from "../../../types/drizzle";

/**
 * Database adapter interface for generic SQL operations
 * Works with any table schema without hardcoding table names or structures
 */
interface DatabaseAdapter {
  insert<T extends Record<string, unknown>>(
    txn: TransactionType,
    table: unknown,
    values: T,
  ): Promise<void>;
  insertReturning<
    T extends Record<string, unknown>,
    R extends Record<string, unknown>,
  >(
    txn: TransactionType,
    table: unknown,
    values: T,
    returningClause: R,
  ): Promise<R[]>;
  isDuplicateKeyError(error: Error): boolean;
  supportsReturning(): boolean;
}

/**
 * Base adapter with common functionality
 */
abstract class BaseAdapter implements DatabaseAdapter {
  protected abstract executeInsert<T extends Record<string, unknown>>(
    txn: TransactionType,
    table: unknown,
    values: T,
  ): Promise<void>;

  protected abstract executeInsertReturning<
    T extends Record<string, unknown>,
    R extends Record<string, unknown>,
  >(
    txn: TransactionType,
    table: unknown,
    values: T,
    returningClause: R,
  ): Promise<R[]>;

  async insert<T extends Record<string, unknown>>(
    txn: TransactionType,
    table: unknown,
    values: T,
  ): Promise<void> {
    return this.executeInsert(txn, table, values);
  }

  async insertReturning<
    T extends Record<string, unknown>,
    R extends Record<string, unknown>,
  >(
    txn: TransactionType,
    table: unknown,
    values: T,
    returningClause: R,
  ): Promise<R[]> {
    return this.executeInsertReturning(txn, table, values, returningClause);
  }

  abstract isDuplicateKeyError(error: Error): boolean;
  abstract supportsReturning(): boolean;
}

/**
 * MySQL adapter - works with any table
 */
class MySQLAdapter extends BaseAdapter {
  protected async executeInsert<T extends Record<string, unknown>>(
    txn: TransactionType,
    table: unknown,
    values: T,
  ): Promise<void> {
    const txnRecord = txn as unknown as Record<string, unknown>;
    const insert = txnRecord.insert as (table: unknown) => {
      values: (data: T) => Promise<void>;
    };
    await insert(table).values(values);
  }

  protected async executeInsertReturning<
    T extends Record<string, unknown>,
    R extends Record<string, unknown>,
  >(
    txn: TransactionType,
    table: unknown,
    values: T,
    returningClause: R,
  ): Promise<R[]> {
    throw new Error("MySQL does not support RETURNING clause");
  }

  isDuplicateKeyError(error: Error): boolean {
    const message = error.message;
    return message.includes("Duplicate entry") || message.includes("1062");
  }

  supportsReturning(): boolean {
    return false;
  }
}

/**
 * PostgreSQL adapter - works with any table
 */
class PostgresAdapter extends BaseAdapter {
  protected async executeInsert<T extends Record<string, unknown>>(
    txn: TransactionType,
    table: unknown,
    values: T,
  ): Promise<void> {
    const txnRecord = txn as unknown as Record<string, unknown>;
    const insert = txnRecord.insert as (table: unknown) => {
      values: (data: T) => Promise<void>;
    };
    await insert(table).values(values);
  }

  protected async executeInsertReturning<
    T extends Record<string, unknown>,
    R extends Record<string, unknown>,
  >(
    txn: TransactionType,
    table: unknown,
    values: T,
    returningClause: R,
  ): Promise<R[]> {
    const txnRecord = txn as unknown as Record<string, unknown>;
    const insert = txnRecord.insert as (table: unknown) => {
      values: (data: T) => {
        returning: (clause: R) => Promise<R[]>;
      };
    };

    const result = await insert(table)
      .values(values)
      .returning(returningClause);
    return result as R[];
  }

  isDuplicateKeyError(error: Error): boolean {
    return error.message.includes("duplicate key value");
  }

  supportsReturning(): boolean {
    return true;
  }
}

/**
 * SQLite adapter - works with any table
 */
class SqliteAdapter extends BaseAdapter {
  protected async executeInsert<T extends Record<string, unknown>>(
    txn: TransactionType,
    table: unknown,
    values: T,
  ): Promise<void> {
    const txnRecord = txn as unknown as Record<string, unknown>;
    const insert = txnRecord.insert as (table: unknown) => {
      values: (data: T) => Promise<void>;
    };
    await insert(table).values(values);
  }

  protected async executeInsertReturning<
    T extends Record<string, unknown>,
    R extends Record<string, unknown>,
  >(
    txn: TransactionType,
    table: unknown,
    values: T,
    returningClause: R,
  ): Promise<R[]> {
    throw new Error("SQLite does not support RETURNING clause");
  }

  isDuplicateKeyError(error: Error): boolean {
    const message = error.message;
    return (
      message.includes("UNIQUE constraint failed") ||
      message.includes("duplicate")
    );
  }

  supportsReturning(): boolean {
    return false;
  }
}

/**
 * Adapter factory
 */
function createAdapter(dbType: EventRepositoryType): DatabaseAdapter {
  switch (dbType) {
    case "MYSQL":
      return new MySQLAdapter();
    case "POSTGRES":
      return new PostgresAdapter();
    case "SQLITE":
      return new SqliteAdapter();
  }
}

/**
 * Generic Event Repository Implementation
 * Fully table-agnostic - works with any event type and any database
 * Adding new event types requires no changes to this class
 * Adding new databases only requires creating a new adapter class
 */
export class GenericEventRepository implements IEventRepository {
  private adapter: DatabaseAdapter;
  private dbType: EventRepositoryType;

  constructor(dbType: EventRepositoryType) {
    this.adapter = createAdapter(dbType);
    this.dbType = dbType;
  }

  /**
   * Insert a new user or skip if already exists (duplicate key)
   */
  async insertOrSkipUser(txn: TransactionType, userId: string): Promise<void> {
    try {
      const { usersTable } = await this.loadSchema();
      await this.adapter.insert(txn, usersTable, { id: userId });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (this.adapter.isDuplicateKeyError(err)) {
        console.log(`User ${userId} already exists, skipping user insertion`);
        return;
      }

      throw this.convertError(`Failed to insert user: ${err.message}`, err);
    }
  }

  /**
   * Insert an event and return the generated ID
   */
  async insertEvent(
    txn: TransactionType,
    reportedTimestamp: string,
    userId: string,
  ): Promise<string> {
    try {
      const { eventsTable, idColumn } = await this.loadSchema();
      let eventId: string;

      if (this.adapter.supportsReturning()) {
        // PostgreSQL - let the database generate and return the ID
        const result = await this.adapter.insertReturning(
          txn,
          eventsTable,
          {
            reported_timestamp: reportedTimestamp,
            userId: userId,
          } as Record<string, unknown>,
          { id: idColumn } as Record<string, unknown>,
        );

        const record = result[0] as Record<string, unknown>;
        if (!record || !record.id) {
          throw this.convertError(
            "Failed to insert event and retrieve ID - no ID returned from database",
            new Error("No ID returned"),
          );
        }
        eventId = record.id as string;
      } else {
        // MySQL and SQLite - generate UUID ourselves
        eventId = crypto.randomUUID();
        await this.adapter.insert(txn, eventsTable, {
          id: eventId,
          reported_timestamp: reportedTimestamp,
          userId: userId,
        } as Record<string, unknown>);
      }

      return eventId;
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }

      const err = error instanceof Error ? error : new Error(String(error));
      throw this.convertError(`Failed to insert event: ${err.message}`, err);
    }
  }

  /**
   * Insert serverless function call event-specific details
   */
  async insertServerlessFunctionCallEventDetails(
    txn: TransactionType,
    eventId: string,
    debitAmount: number,
  ): Promise<void> {
    try {
      const { serverlessFunctionCallEventsTable } = await this.loadSchema();
      await this.adapter.insert(txn, serverlessFunctionCallEventsTable, {
        id: eventId,
        debitAmount: debitAmount,
      } as Record<string, unknown>);
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }

      const err = error instanceof Error ? error : new Error(String(error));
      throw this.convertError(
        `Failed to insert serverless function call event details: ${err.message}`,
        err,
      );
    }
  }

  /**
   * Convert database-specific errors to appropriate error types
   */
  private convertError(message: string, originalError: Error): Error {
    return StorageError.queryFailed(message, originalError);
  }

  /**
   * Load schema based on configured database type
   */
  private async loadSchema() {
    const mod = await this.loadDatabaseModule();
    return {
      usersTable: mod.usersTable,
      eventsTable: mod.eventsTable,
      idColumn: mod.eventsTable.id,
      serverlessFunctionCallEventsTable: mod.serverlessFunctionCallEventsTable,
    };
  }

  /**
   * Dynamically load the correct database module based on dbType
   */
  private async loadDatabaseModule() {
    switch (this.dbType) {
      case "MYSQL":
        return await import("../../db/mysql/db");
      case "POSTGRES":
        return await import("../../db/postgres/db");
      case "SQLITE":
        return await import("../../db/sqlite/db");
    }
  }
}
