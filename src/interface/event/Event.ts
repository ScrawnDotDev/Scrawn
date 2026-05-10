import type { DateTime } from "luxon";
import type { UserId } from "../../config/identifiers";

export type SDKCallEventData = {
  sdkCallType: "RAW" | "MIDDLEWARE_CALL";
  debitAmount: number;
};

export type AITokenUsageEventData = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputDebitAmount: number;
  outputDebitAmount: number;
};

export type PaymentEventData = {
  creditAmount: number;
};

export type EventKind =
  | "SDK_CALL"
  | "AI_TOKEN_USAGE"
  | "PAYMENT"

export type EventDataMap = {
  SDK_CALL: SDKCallEventData;
  AI_TOKEN_USAGE: AITokenUsageEventData;
  PAYMENT: PaymentEventData;
};

export type EventData<K extends EventKind> = EventDataMap[K];

export type SqlRecord =
  | { type: "SDK_CALL"; reported_timestamp: DateTime; data: SDKCallEventData; userId: UserId }
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

export interface SDKCallEvent extends Event<"SDK_CALL"> {
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
