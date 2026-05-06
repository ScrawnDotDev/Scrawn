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
  handlePriceRequestAiTokenUsage,
  handleAddMetadata,
  handleAddUser,
} from "./handlers";
import type {
  SerializedEvent,
  EventKind,
  SqlRecord,
} from "../../../interface/event/Event";
import type { UserId } from "../../../config/identifiers";
import type { DateTime } from "luxon";

function dispatchToHandler(type: EventKind, data: SqlRecord<EventKind>, apiKeyId?: string) {
  switch (type) {
    case "SDK_CALL":
      if (!apiKeyId) throw StorageError.missingApiKeyId();
      return handleAddSdkCall(data as never, apiKeyId);
    case "AI_TOKEN_USAGE":
      if (!apiKeyId) throw StorageError.missingApiKeyId();
      return handleAddAiTokenUsage([data as never], apiKeyId);
    case "ADD_KEY":
      return handleAddKey(data as never);
    case "PAYMENT":
      return handleAddPayment(data as never, apiKeyId);
    case "METADATA":
      return handleAddMetadata(data as never);
    case "USER":
      return handleAddUser(data as never);
    default:
      const _exhaustive: never = type;
      throw StorageError.unknownEventType(_exhaustive as EventKind);
  }
}

function dispatchPriceHandler(type: EventKind, userId: UserId, ts: DateTime) {
  switch (type) {
    case "PAYMENT":
      return handlePriceRequestPayment(userId, ts);
    case "SDK_CALL":
      return handlePriceRequestSdkCall(userId, ts);
    case "AI_TOKEN_USAGE":
      return handlePriceRequestAiTokenUsage(userId, ts);
    default:
      throw StorageError.unknownEventType(type);
  }
}

export class PostgresAdapter implements StorageAdapter {
  // fallow-ignore-next-line unused-class-member
  connectionObject = getPostgresDB();

  // fallow-ignore-next-line unused-class-member
  async add(serialized: SerializedEvent<EventKind>, apiKeyId?: string) {
    let event_data: SqlRecord<EventKind>;

    try {
      const { SQL } = serialized;
      event_data = SQL;

      if (!event_data) {
        throw StorageError.serializationFailed(
          "Event serialization returned null or undefined"
        );
      }
    } catch (e) {
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

    return dispatchToHandler(event_data.type, event_data, apiKeyId);
  }

  // fallow-ignore-next-line unused-class-member
  async price(
    userID: UserId,
    event_type: EventKind,
    beforeTimestamp: DateTime
  ): Promise<number> {
    return dispatchPriceHandler(event_type, userID, beforeTimestamp);
  }
}