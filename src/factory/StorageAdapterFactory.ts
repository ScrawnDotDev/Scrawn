import type { EventType } from "../interface/event/Event.ts";
import type { StorageAdapterType } from "../interface/storage/Storage.ts";
import { PostgresStorageAdapter } from "../classes/storage.ts";

/**
 * StorageAdapterFactory
 *
 * Maps a singular event to its corresponding storage adapter.
 * This factory pattern allows for flexible routing of events to their appropriate storage implementations.
 *
 * Design:
 * - Takes a single event as input
 * - Returns a single, appropriate storage adapter for that event type
 * - Event type determines which storage backend to use
 */
export class StorageAdapterFactory {
  /**
   * Get the appropriate storage adapter for a given event
   *
   * @param event - The event to get a storage adapter for
   * @returns The storage adapter instance for the event type
   * @throws Error if no adapter is registered for the event type
   */
  public static getStorageAdapter(event: EventType): StorageAdapterType {
    switch (event.type) {
      case "SERVERLESS_FUNCTION_CALL":
        return new PostgresStorageAdapter(event);
      default:
        // Exhaustive check - TypeScript will error if a new event type is added without a case
        const exhaustiveCheck: never = event.type;
        throw new Error(
          `No storage adapter registered for event type: ${exhaustiveCheck}`,
        );
    }
  }
}
