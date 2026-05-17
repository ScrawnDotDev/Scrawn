import type { DateTime } from "luxon";
import type { UserId } from "../../config/identifiers";

export type BasicUsageEventData = {
  basicUsageType: "RAW" | "MIDDLEWARE_CALL";
  debitAmount: number;
  metadata?: Record<string, unknown>;
};

export type AITokenUsageEventData = {
  model: string;
  provider: string;
  inputTokens: number;
  inputCacheTokens: number;
  outputTokens: number;
  inputDebitAmount: number;
  inputCacheDebitAmount: number;
  outputDebitAmount: number;
  metadata?: Record<string, unknown>;
};

export type PaymentEventData = {
  creditAmount: number;
};

export type EventKind =
  | "BASIC_USAGE"
  | "AI_TOKEN_USAGE"
  | "PAYMENT"

export type EventDataMap = {
  BASIC_USAGE: BasicUsageEventData;
  AI_TOKEN_USAGE: AITokenUsageEventData;
  PAYMENT: PaymentEventData;
};

export type EventData<K extends EventKind> = EventDataMap[K];

export type SqlRecord =
  | { type: "BASIC_USAGE"; reported_timestamp: DateTime; data: BasicUsageEventData; userId: UserId }
  | { type: "AI_TOKEN_USAGE"; reported_timestamp: DateTime; data: AITokenUsageEventData; userId: UserId }
  | { type: "PAYMENT"; reported_timestamp: DateTime; data: PaymentEventData; userId: UserId }

export type SqlRecordOf<K extends EventKind> = Extract<SqlRecord, { type: K }>;

export type SerializedEvent = {
  SQL: SqlRecord;
};

export interface Event<K extends EventKind = EventKind> {
  readonly type: K;
  readonly ingested_timestamp: DateTime;
  readonly data: EventData<K>;

  serialize(): SerializedEvent;
}

export interface BasicUsageEvent extends Event<"BASIC_USAGE"> {
  readonly userId: UserId;
  readonly reportedTimestamp: DateTime;
}

export interface AITokenUsageEvent extends Event<"AI_TOKEN_USAGE"> {
  readonly userId: UserId;
  readonly reportedTimestamp: DateTime;
}

export interface PaymentEvent extends Event<"PAYMENT"> {
  readonly userId: UserId;
}
