import type { EventType } from "../event/Event";

/**
 * SQLStorageAdapter - Base interface for SQL-based storage implementations
 * This is database-agnostic and can be implemented by PostgreSQL, SQLite, MySQL, etc.
 */
export interface SQLStorageAdapter {
  readonly name: "POSTGRES" | "SQLITE" | "MYSQL";
  readonly connectionObject: unknown;
  readonly event: EventType;

  add(): Promise<void>;
}
