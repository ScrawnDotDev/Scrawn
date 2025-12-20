import { type StorageAdapter } from "../../../interface/storage/Storage";
import { type Event } from "../../../interface/event/Event";
import { getPostgresDB } from "../../db/postgres/db";
import { StorageError } from "../../../errors/storage";
import {
  handleAddSdkCall,
  handleAddKey,
  handleAddPayment,
  handlePriceRequestPayment,
  handlePriceRequestSdkCall,
  handleAddAiTokenUsage,
} from "./handlers";
import type {
  SerializedEvent,
  EventKind,
} from "../../../interface/event/Event";

export class PostgresAdapter implements StorageAdapter {
  name: string;
  connectionObject;
  apiKeyId?: string;

  constructor(event: Event, apiKeyId?: string) {
    this.name = event.type;
    this.connectionObject = getPostgresDB();
    this.apiKeyId = apiKeyId;
  }

  async add(serialized: SerializedEvent<EventKind>) {
    let event_data;

    try {
      const { SQL } = serialized;
      event_data = SQL;

      if (!event_data) {
        throw StorageError.serializationFailed(
          "Event serialization returned null or undefined",
        );
      }
    } catch (e) {
      // Use duck typing instead of instanceof to work with mocked modules
      if (
        e &&
        typeof e === "object" &&
        "type" in e &&
        (e as any).name === "StorageError"
      ) {
        throw e;
      }
      throw StorageError.serializationFailed(
        "Failed to serialize event data",
        e instanceof Error ? e : new Error(String(e)),
      );
    }

    switch (event_data.type) {
      case "SDK_CALL": {
        if (!this.apiKeyId) {
          throw StorageError.missingApiKeyId();
        }
        return await handleAddSdkCall(event_data, this.apiKeyId);
      }

      case "ADD_KEY": {
        return await handleAddKey(event_data);
      }

      case "PAYMENT": {
        return await handleAddPayment(event_data, this.apiKeyId);
      }

      case "AI_TOKEN_USAGE": {
        if (!this.apiKeyId) {
          throw StorageError.missingApiKeyId();
        }
        return await handleAddAiTokenUsage([event_data], this.apiKeyId);
      }

      default: {
        throw StorageError.unknownEventType(event_data.type);
      }
    }
  }

  async price(serialized: SerializedEvent<EventKind>): Promise<number> {
    let event_data;

    try {
      const { SQL } = serialized;
      event_data = SQL;

      if (!event_data) {
        throw StorageError.serializationFailed(
          "Event serialization returned null or undefined",
        );
      }
    } catch (e) {
      // Use duck typing instead of instanceof to work with mocked modules
      if (
        e &&
        typeof e === "object" &&
        "type" in e &&
        (e as any).name === "StorageError"
      ) {
        throw e;
      }
      throw StorageError.serializationFailed(
        "Failed to serialize event data for price calculation",
        e instanceof Error ? e : new Error(String(e)),
      );
    }

    switch (event_data.type) {
      case "REQUEST_PAYMENT": {
        return await handlePriceRequestPayment(event_data);
      }

      case "REQUEST_SDK_CALL": {
        return await handlePriceRequestSdkCall(event_data);
      }

      default: {
        throw StorageError.unknownEventType(event_data.type);
      }
    }
  }
}
