import type { EventKind } from "../interface/event/Event.ts";
import { ClickHouseAdapter } from "../storage/adapter/clickhouse/ClickHouseAdapter.ts";
import { PostgresAdapter } from "../storage/adapter/postgres/postgres.js";

export class StorageAdapterFactory {
  public static async getEventStorageAdapter(RequestType: EventKind) {
    switch (RequestType) {
      case "BASIC_USAGE":
      case "AI_TOKEN_USAGE":
      case "PAYMENT": {
        return new PostgresAdapter();
      }
      default: {
        throw new Error(`Unknown event type: ${RequestType}`);
      }
    }
  }
}
