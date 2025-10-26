import type { EventType } from "../event/Event.ts";

/**
 * Storage - Consumes events
 */
export interface StorageAdapterType {
  name: string;
  event: EventType;

  consume(): Promise<void>;
}

export interface PostgresStorageAdapterType extends StorageAdapterType {
  name: "POSTGRES";
}
