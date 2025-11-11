import type { EventType } from "../interface/event/Event.ts";
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
  public static async getStorageAdapter(event: EventType, apiKeyId?: string) {
    switch (event.type) {
      case "SDK_CALL": {
        return new PostgresAdapter(event, apiKeyId);
      }
      case "PAYMENT": {
        return new PostgresAdapter(event, apiKeyId);
      }
      case "ADD_KEY": {
        return new PostgresAdapter(event);
      }
      case "REQUEST_PAYMENT": {
        return new PostgresAdapter(event);
      }
      case "REQUEST_SDK_CALL": {
        return new PostgresAdapter(event);
      }
      default: {
        throw new Error(`Unknown event type: ${event}`);
      }
    }
  }
}
