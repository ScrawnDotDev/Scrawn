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
