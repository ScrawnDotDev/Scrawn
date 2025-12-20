import type { EventStorageAdapterMap, EventType } from "../event/Event";

/**
 * Storage - Consumes events
 */
export interface StorageAdapterType {
  name: string;
  connectionObject: unknown;

  add(serialized: EventStorageAdapterMap<EventType["type"]>): Promise<{ id: string } | void>;
  price(serialized: EventStorageAdapterMap<EventType["type"]>): Promise<number>;
}
