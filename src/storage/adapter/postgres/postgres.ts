import { type StorageAdapter } from "../../../interface/storage/Storage";
import { getPostgresDB } from "../../db/postgres/db";
import { StorageError } from "../../../errors/storage";
import {
  handleAddSdkCall,
  handleAddPayment,
  handlePriceRequestPayment,
  handlePriceRequestSdkCall,
  handleAddAiTokenUsage,
  handlePriceRequestAiTokenUsage,
} from "./handlers";
import type {
  SerializedEvent,
  EventKind,
  SqlRecord,
} from "../../../interface/event/Event";
import type { UserId } from "../../../config/identifiers";
import type { DateTime } from "luxon";

export class PostgresAdapter implements StorageAdapter {
  connectionObject = getPostgresDB();

  async add(serialized: SerializedEvent, apiKeyId?: string) {
    let event_data: SqlRecord;

    try {
      const { SQL } = serialized;
      event_data = SQL;

      if (!event_data) {
        throw StorageError.serializationFailed(
          "Event serialization returned null or undefined"
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
        e instanceof Error ? e : new Error(String(e))
      );
    }

    switch (event_data.type) {
      case "SDK_CALL": {
        if (!apiKeyId) {
          throw StorageError.missingApiKeyId();
        }
        return await handleAddSdkCall(event_data, apiKeyId);
      }

      case "AI_TOKEN_USAGE": {
        if (!apiKeyId) {
          throw StorageError.missingApiKeyId();
        }
        return await handleAddAiTokenUsage([event_data], apiKeyId);
      }

      case "PAYMENT": {
        return await handleAddPayment(event_data, apiKeyId);
      }

      default: {
        throw StorageError.unknownEventType(event_data);
      }
    }
  }

  async price(
    userID: UserId,
    event_type: EventKind,
    beforeTimestamp: DateTime
  ): Promise<number> {
    switch (event_type) {
      case "PAYMENT": {
        return await handlePriceRequestPayment(userID, beforeTimestamp);
      }

      case "SDK_CALL": {
        return await handlePriceRequestSdkCall(userID, beforeTimestamp);
      }

      case "AI_TOKEN_USAGE": {
        return await handlePriceRequestAiTokenUsage(userID, beforeTimestamp);
      }

      default: {
        throw StorageError.unknownEventType(event_type);
      }
    }
  }
}
