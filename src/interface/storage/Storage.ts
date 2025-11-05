import type { EventType } from "../event/Event";

/**
 * Storage - Consumes events
 */
export interface StorageAdapterType {
  name: string;
  connectionObject: unknown;
  event: EventType;

  add(): Promise<void>;
}

/**
 * SQL Storage Adapter - Base interface for all SQL database implementations
 * Implemented by PostgreSQL, SQLite, and MySQL adapters
 */
export interface SQLStorageAdapter extends StorageAdapterType {
  name: "POSTGRES" | "SQLITE" | "MYSQL";
}
