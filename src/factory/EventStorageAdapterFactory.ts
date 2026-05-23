import { STORAGE_ADAPTER } from "../config/identifiers.ts";
import type { EventKind } from "../interface/event/Event.ts";
import type { StorageAdapter } from "../interface/storage/Storage.ts";
import { ClickHouseAdapter } from "../storage/adapter/clickhouse/ClickHouseAdapter.ts";
import { PostgresAdapter } from "../storage/adapter/postgres/postgres.js";

export class StorageAdapterFactory {
  private static adapter: StorageAdapter | null = null;

  public static async getEventStorageAdapter(): Promise<StorageAdapter> {
    if (this.adapter) return this.adapter;

    switch (STORAGE_ADAPTER) {
      case "clickhouse": {
        this.adapter = new ClickHouseAdapter();
        break;
      }
      case "postgres": {
        this.adapter = new PostgresAdapter();
        break;
      }
    }

    return this.adapter;
  }
}
