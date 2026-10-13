import {
  type StorageAdapter,
  type QueryRequest,
  type QueryResponse,
} from "../../../interface/storage/Storage";
import { getClickHouseDB } from "../../db/clickhouse";
import { StorageError } from "../../../errors/storage";
import {
  handleAddBasicUsage,
  handleAddAiTokenUsage,
  handlePriceRequestBasicUsage,
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
import type { AuthContext } from "../../../context/auth";
import type { PgTransaction } from "drizzle-orm/pg-core";

export class ClickHouseAdapter implements StorageAdapter {
  connectionObject = getClickHouseDB();

  async add(serialized: SerializedEvent, auth: AuthContext) {
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
        if (!auth.apiKeyId) {
          throw StorageError.missingApiKeyId();
        }
        return await handleAddBasicUsage(event_data, auth);
      }

      case "AI_TOKEN_USAGE": {
        if (!auth.apiKeyId) {
          throw StorageError.missingApiKeyId();
        }
        return await handleAddAiTokenUsage([event_data], auth);
      }

      default: {
        throw StorageError.unknownEventType((event_data as SqlRecord).type);
      }
    }
  }

  async price(
    userID: UserId,
    event_type: EventKind,
    beforeTimestamp: DateTime,
    auth: AuthContext,
    txn?: unknown
  ): Promise<number> {
    // Events live in ClickHouse, but the last-billed lookup reads Postgres
    // and must run on the caller's transaction (see runClickHousePriceQuery).
    const tx = txn as PgTransaction<any, any, any> | undefined;
    switch (event_type) {
      case "BASIC_USAGE": {
        return await handlePriceRequestBasicUsage(
          userID,
          beforeTimestamp,
          auth,
          tx
        );
      }

      case "AI_TOKEN_USAGE": {
        return await handlePriceRequestAiTokenUsage(
          userID,
          beforeTimestamp,
          auth,
          tx
        );
      }

      default: {
        throw StorageError.unknownEventType(event_type as string);
      }
    }
  }

  async query(
    request: QueryRequest,
    auth: AuthContext
  ): Promise<QueryResponse> {
    return await handleQueryEvents(request, auth);
  }
}
