import type { EventType } from "../interface/event/Event.ts";
import { SQLAdapterFactory } from "../storage/handlers/SQLAdapter.ts";

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
   * @returns The storage adapter instance for the event type
   */
  public static async getStorageAdapter(event: EventType) {
    return await SQLAdapterFactory.getConnector();
  }
}
