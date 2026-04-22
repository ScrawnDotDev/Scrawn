import type { Event } from "../interface/event/Event.ts";
import type { StorageAdapter } from "../interface/storage/Storage.ts";
import { PostgresAdapter } from "../storage/adapter/postgres/postgres.ts";

export const REQUEST_EVENT_BASE_MAP: Record<string, string> = {
  REQUEST_SDK_CALL: "SDK_CALL",
  REQUEST_AI_TOKEN_USAGE: "AI_TOKEN_USAGE",
  REQUEST_PAYMENT: "PAYMENT",
};

const ADAPTER_KEY_MAP: Record<string, string> = {
  SDK_CALL: "postgres_adapter",
  AI_TOKEN_USAGE: "postgres_adapter",
  PAYMENT: "postgres_adapter",
  ADD_KEY: "postgres_adapter",
};

const ADAPTER_FACTORIES: Record<
  string,
  (event: Event, apiKeyId?: string) => StorageAdapter
> = {
  postgres_adapter: (event, apiKeyId) => new PostgresAdapter(event, apiKeyId),
};

export class StorageAdapterFactory {
  public static async getStorageAdapter(event: Event, apiKeyId?: string) {
    const baseEventType = REQUEST_EVENT_BASE_MAP[event.type] ?? event.type;
    const adapterKey = ADAPTER_KEY_MAP[baseEventType];
    if (!adapterKey) {
      throw new Error(`Unknown event type: ${event.type}`);
    }
    const createAdapter = ADAPTER_FACTORIES[adapterKey];
    if (!createAdapter) {
      throw new Error(`No adapter factory found for key: ${adapterKey}`);
    }
    return createAdapter(event, apiKeyId);
  }
}
