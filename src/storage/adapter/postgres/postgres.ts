import {
  type StorageAdapter,
  type QueryRequest,
  type QueryResponse,
} from "../../../interface/storage/Storage";
import { getPostgresDB } from "../../db/postgres/db";
import { StorageError } from "../../../errors/storage";
import {
  handleAddBasicUsage,
  handlePriceRequestBasicUsage,
  handleAddAiTokenUsage,
  handlePriceRequestAiTokenUsage,
  handleQueryEvents,
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

  async add(
    serialized: SerializedEvent,
    apiKeyId: string,
    mode: "production" | "test"
  ) {
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
      case "BASIC_USAGE": {
        if (!apiKeyId) {
          throw StorageError.missingApiKeyId();
        }
        return await handleAddBasicUsage(event_data, apiKeyId, mode);
      }

      case "AI_TOKEN_USAGE": {
        if (!apiKeyId) {
          throw StorageError.missingApiKeyId();
        }
        return await handleAddAiTokenUsage([event_data], apiKeyId, mode);
      }

      default: {
        throw StorageError.unknownEventType(event_data);
      }
    }
  }

  async price(
    userID: UserId,
    event_type: EventKind,
    beforeTimestamp: DateTime,
    mode: "production" | "test"
  ): Promise<number> {
    switch (event_type) {
      case "BASIC_USAGE": {
        return await handlePriceRequestBasicUsage(userID, beforeTimestamp, mode);
      }

      case "AI_TOKEN_USAGE": {
        return await handlePriceRequestAiTokenUsage(
          userID,
          beforeTimestamp,
          mode
        );
      }

      default: {
        throw StorageError.unknownEventType(event_type);
      }
    }
  }

  async query(request: QueryRequest): Promise<QueryResponse> {
    return await handleQueryEvents(request);
  }
}
