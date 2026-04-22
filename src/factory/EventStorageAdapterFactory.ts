import type { EventKind } from "../interface/event/Event.ts";
import { PostgresAdapter } from "../storage/adapter/postgres/postgres.ts";

/**
 * StorageAdapterFactory - Facade for the new SQL adapter factory
 *
 * Maintains backward compatibility while delegating to the new
 * dependency-injected SQL adapter factory
 */
export class StorageAdapterFactory {
  /**
   * Get the appropriate storage adapter for a given event
   *
   * @param event - The event to get a storage adapter for
   * @param apiKeyId - Optional API key ID to associate with the event
   * @returns The storage adapter instance for the event type
   */
  public static async getEventStorageAdapter(RequestType: EventKind) {
    switch (RequestType) {
      case "SDK_CALL": {
        return new PostgresAdapter();
      }
      case "AI_TOKEN_USAGE": {
        return new PostgresAdapter();
      }
      case "PAYMENT": {
        return new PostgresAdapter();
      }
      case "ADD_KEY": {
        return new PostgresAdapter();
      }
      default: {
        throw new Error(`Unknown event type: ${RequestType}`);
      }
    }
  }
}
