import type { EventKind } from "../interface/event/Event.ts";
import { PostgresAdapter } from "../storage/adapter/postgres/postgres.ts";
import { ClickHouseAdapter } from "../storage/adapter/clickhouse/ClickHouseAdapter.ts";

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
        return new ClickHouseAdapter();
      }
      case "AI_TOKEN_USAGE": {
        return new ClickHouseAdapter();
      }
      case "PAYMENT": {
        return new PostgresAdapter();
      }
      case "ADD_KEY": {
        return new PostgresAdapter();
      }
      case "METADATA": {
        return new PostgresAdapter();
      }
      case "USER": {
        return new PostgresAdapter();
      }
      default: {
        throw new Error(`Unknown event type: ${RequestType}`);
      }
    }
  }
}
