import type { DateTime } from "luxon";
import type { UserId } from "../../config/identifiers";

/**
 * Event payload data structures
 */
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

export type AddKeyEventData = {
  name: string;
  key: string;
  expiresAt: string;
};

export type PaymentEventData = {
  creditAmount: number;
};

export type RequestPaymentEventData = null;

export type RequestSDKCallEventData = null;

/**
 * Event kind discriminator
 */
export type EventKind =
  | "SDK_CALL"
  | "AI_TOKEN_USAGE"
  | "ADD_KEY"
  | "PAYMENT"
  | "REQUEST_PAYMENT"
  | "REQUEST_SDK_CALL";

/**
 * Mapping of event kinds to their data structures
 */
export type EventDataMap = {
  SDK_CALL: SDKCallEventData;
  AI_TOKEN_USAGE: AITokenUsageEventData;
  ADD_KEY: AddKeyEventData;
  PAYMENT: PaymentEventData;
  REQUEST_PAYMENT: RequestPaymentEventData;
  REQUEST_SDK_CALL: RequestSDKCallEventData;
};

/**
 * Get event data type for a specific event kind
 */
export type EventData<K extends EventKind> = EventDataMap[K];

/**
 * Base SQL record structure for all events
 */
type BaseSqlRecord<K extends EventKind> = {
  type: K;
  reported_timestamp: DateTime;
  data: EventData<K>;
};

/**
 * SQL record structure for events that require userId
 */
type SqlRecordWithUserId<K extends EventKind> = BaseSqlRecord<K> & {
  userId: UserId;
};

/**
 * Mapping of event kinds to their SQL record structures
 */
type SqlRecordMap = {
  ADD_KEY: BaseSqlRecord<"ADD_KEY">;
  SDK_CALL: SqlRecordWithUserId<"SDK_CALL">;
  AI_TOKEN_USAGE: SqlRecordWithUserId<"AI_TOKEN_USAGE">;
  PAYMENT: SqlRecordWithUserId<"PAYMENT">;
  REQUEST_PAYMENT: SqlRecordWithUserId<"REQUEST_PAYMENT">;
  REQUEST_SDK_CALL: SqlRecordWithUserId<"REQUEST_SDK_CALL">;
};

/**
 * Get SQL record type for a specific event kind
 */
export type SqlRecord<K extends EventKind> = SqlRecordMap[K];

/**
 * Serialized event format (wrapped in SQL adapter envelope)
 */
export type SerializedEvent<K extends EventKind = EventKind> = {
  SQL: SqlRecord<K>;
};

/**
 * Base Event interface - all events in the system implement this
 */
export interface Event<K extends EventKind = EventKind> {
  readonly type: K;
  readonly reported_timestamp: DateTime;
  readonly data: EventData<K>;

  serialize(): SerializedEvent<K>;
}

/**
 * SDK Call Event
 */
export interface SDKCallEvent extends Event<"SDK_CALL"> {
  readonly userId: UserId;
}

/**
 * AI Token Usage Event
 */
export interface AITokenUsageEvent extends Event<"AI_TOKEN_USAGE"> {
  readonly userId: UserId;
}

/**
 * Add Key Event
 */
export interface AddKeyEvent extends Event<"ADD_KEY"> {}

/**
 * Payment Event
 */
export interface PaymentEvent extends Event<"PAYMENT"> {
  readonly userId: UserId;
}

/**
 * Payment Request Event
 */
export interface RequestPaymentEvent extends Event<"REQUEST_PAYMENT"> {
  readonly userId: UserId;
}

/**
 * SDK Call Request Event
 */
export interface RequestSDKCallEvent extends Event<"REQUEST_SDK_CALL"> {
  readonly userId: UserId;
}
