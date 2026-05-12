import type { SerializedEvent, EventKind } from "../event/Event";
import { type UserId } from "../../config/identifiers";
import type { DateTime } from "luxon";

export type QueryOperator = "EQ" | "GT" | "GTE" | "LT" | "LTE" | "NEQ";

export interface QueryFilter {
  field: string;
  operator: QueryOperator;
  value: string;
}

export interface QueryAggregation {
  type: "SUM" | "COUNT";
  field?: string;
}

export interface QueryRequest {
  filters: QueryFilter[];
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
    apiKeyId?: string
  ): Promise<{ id: string } | void>;
  price(
    userID: UserId,
    event_type: EventKind,
    beforeTimestamp: DateTime
  ): Promise<number>;
  query(request: QueryRequest): Promise<QueryResponse>;
}
