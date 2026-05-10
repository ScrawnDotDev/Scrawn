import type { SerializedEvent, EventKind } from "../event/Event";
import { type UserId } from "../../config/identifiers";
import type { DateTime } from "luxon";

/**
 * Storage Adapter - consumes and persists events
 */
export interface StorageAdapter {
  connectionObject: unknown;

  add(
    serialized: SerializedEvent,
    apiKeyId?: string
  ): Promise<{ id: string } | void>;
  price(
    userID: UserId,
    event_type: EventKind,
    beforeTimestamp: DateTime
  ): Promise<number>;
}
