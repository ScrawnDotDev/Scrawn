import type { SerializedEvent, EventKind } from "../event/Event";
import { type UserId } from "../../config/identifiers";

/**
 * Storage Adapter - consumes and persists events
 */
export interface StorageAdapter {
  connectionObject: unknown;

  add(
    serialized: SerializedEvent<EventKind>,
    apiKeyId?: string
  ): Promise<{ id: string } | void>;
  price(userID: UserId, event_type: EventKind): Promise<number>;
}
