import type { EventKind } from "../interface/event/Event.ts";
import { PostgresAdapter } from "../storage/adapter/postgres/postgres.ts";
import { ClickHouseAdapter } from "../storage/adapter/clickhouse/ClickHouseAdapter.ts";

export class StorageAdapterFactory {
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
      default: {
        throw new Error(`Unknown event type: ${RequestType}`);
      }
    }
  }
}
