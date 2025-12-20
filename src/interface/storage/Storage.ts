import type { SerializedEvent, EventKind } from "../event/Event";

/**
 * Storage Adapter - consumes and persists events
 */
export interface StorageAdapter {
  name: string;
  connectionObject: unknown;

  add(serialized: SerializedEvent<EventKind>): Promise<{ id: string } | void>;
  price(serialized: SerializedEvent<EventKind>): Promise<number>;
}
