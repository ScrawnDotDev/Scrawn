import type { EventType } from "../event/Event.ts";

/**
 * Storage - Consumes events
 */
export interface StorageAdapter {
  name: string;
  consume(event: EventType): Promise<void>;
}

export interface PostgresStorageAdapter extends StorageAdapter {
  name: "POSTGRES",
}