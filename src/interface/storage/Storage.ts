import type { SerializedEvent, EventKind } from "../event/Event";
import { type UserId } from "../../config/identifiers";
import type { DateTime } from "luxon";
import type { AuthContext } from "../../context/auth";

export type QueryOperator = "EQ" | "GT" | "GTE" | "LT" | "LTE" | "NEQ";

export const QUERY_FIELD_NAMES = [
  "eventType",
  "reportedTimestamp",
  "ingestedTimestamp",
  "userId",
  "apiKeyId",
  "basicUsageType",
  "debitAmount",
  "model",
  "inputTokens",
  "outputTokens",
  "inputDebitAmount",
  "outputDebitAmount",
  "inputCacheTokens",
  "inputCacheDebitAmount",
  "creditAmount",
  "provider",
  "metadata",
  "idempotencyKey",
] as const;

export type QueryFieldName = (typeof QUERY_FIELD_NAMES)[number];

export interface QueryFilter {
  field: QueryFieldName;
  operator: QueryOperator;
  value: string;
}

export interface QueryFilterGroup {
  logical: "AND" | "OR";
  conditions: QueryFilter[];
  groups: QueryFilterGroup[];
}

export interface QueryAggregation {
  type: "SUM" | "COUNT";
  field?: string;
}

export interface QueryRequest {
  where: QueryFilterGroup;
  aggregation?: QueryAggregation;
  groupBy?: string;
  limit?: number;
  offset?: number;
}

export type QueryResultRow = Record<string, unknown>;

export interface QueryResponse {
  rows: QueryResultRow[];
  total: number;
}

/**
 * Storage Adapter - consumes and persists events
 */
export interface StorageAdapter {
  connectionObject: unknown;

  add(
    serialized: SerializedEvent,
    auth: AuthContext
  ): Promise<{ id: string } | void>;
  price(
    userID: UserId,
    event_type: EventKind,
    beforeTimestamp: DateTime,
    auth: AuthContext,
    txn?: unknown
  ): Promise<number>;
  query(request: QueryRequest, auth: AuthContext): Promise<QueryResponse>;
}
