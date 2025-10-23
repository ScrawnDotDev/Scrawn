import type { Event } from "../interface/event/index.ts";
import type { StorageAdapter } from "../interface/storage/Storage.ts";

/**
 * StorageAdapterFactory
 *
 * Associates event types with their corresponding storage adapters.
 * This factory pattern allows for flexible mapping of events to storage implementations.
 *
 * Will be expanded to support additional event types in the future.
 */
export class StorageAdapterFactory {
  private static eventStorageMap: Map<string, () => StorageAdapter> = new Map();

  /**
   * Initialize the factory with event-to-storage mappings
   * This should be called during application startup
   */
  public static initialize(): void {
    // Map ServerlessFunctionCallEvent to PostgreSQL storage adapter
    
    this.registerAdapter("SERVERLESS_FUNCTION_CALL", () => this.getPostgresAdapter());
  }

  /**
   * Get the appropriate storage adapter for a given event
   *
   * @param event - The event to get a storage adapter for
   * @returns The storage adapter for the event type
   * @throws Error if no adapter is registered for the event type
   */
  public static getAdapter(event: Event): StorageAdapter {
    const adapterFactory = this.eventStorageMap.get(event.type);

    if (!adapterFactory) {
      throw new Error(
        `No storage adapter registered for event type: ${event.type}`
      );
    }

    return adapterFactory();
  }

  /**
   * Get the Postgres storage adapter
   *
   * @returns PostgreSQL storage adapter instance
   */
  private static getPostgresAdapter(): StorageAdapter {
    // TODO: Implement PostgreSQL storage adapter
    // This will be the concrete implementation that stores ServerlessFunctionCallEvent data
    throw new Error("PostgreSQL storage adapter not yet implemented");
  }

  /**
   * Register a new event-to-storage mapping
   *
   * Useful for extending the factory with new event types and storage adapters
   *
   * @param eventType - The event type identifier
   * @param adapterFactory - Factory function that returns a storage adapter instance
   */
  public static registerAdapter(
    eventType: string,
    adapterFactory: () => StorageAdapter
  ): void {
    this.eventStorageMap.set(eventType, adapterFactory);
  }
}
