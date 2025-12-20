import { DateTime } from "luxon";
import { type UserId } from "../../config/identifiers";

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
 * Mapping of event types to their data structures
 */
export type EventDataMap = {
  SDK_CALL: SDKCallEventData;
  AI_TOKEN_USAGE: AITokenUsageEventData;
  ADD_KEY: AddKeyEventData;
  PAYMENT: PaymentEventData;
  REQUEST_PAYMENT: RequestPaymentEventData;
  REQUEST_SDK_CALL: RequestSDKCallEventData;
};

export type EventUnion<T extends keyof EventDataMap> = {
  [K in keyof EventDataMap]: EventDataMap[K];
}[T];

export type BaseEventMetadata<T extends keyof EventDataMap> = {
  type: T;
  reported_timestamp: DateTime;
  data: EventDataMap[T];
};

type EventMetadataMap = {
  ADD_KEY: BaseEventMetadata<"ADD_KEY">;
  SDK_CALL: BaseEventMetadata<"SDK_CALL"> & { userId: UserId };
  AI_TOKEN_USAGE: BaseEventMetadata<"AI_TOKEN_USAGE"> & { userId: UserId };
  PAYMENT: BaseEventMetadata<"PAYMENT"> & { userId: UserId };
  REQUEST_PAYMENT: BaseEventMetadata<"REQUEST_PAYMENT"> & { userId: UserId };
  REQUEST_SDK_CALL: BaseEventMetadata<"REQUEST_SDK_CALL"> & { userId: UserId };
};

export type EventStorageAdapterMap<Type extends keyof EventDataMap> = {
  SQL: {
    [K in keyof EventDataMap]: EventMetadataMap[K];
  }[Type];
};

type EventStorageAdapterUnion<T extends keyof EventDataMap> = {
  [K in keyof EventDataMap]: EventStorageAdapterMap<K>;
}[T];

/**
 * Base Event interface - all events in the system extend this
 */
export interface EventType<
  Type extends keyof EventDataMap = keyof EventDataMap,
> {
  type: Type;
  readonly reported_timestamp: DateTime;
  readonly data: EventDataMap[Type];

  serialize(): EventStorageAdapterUnion<Type>;
}

/**
 * SDK Call Event
 */
export interface SDKCallEventType extends EventType<"SDK_CALL"> {
  readonly userId: UserId;
}

/**
 * AI Token Usage Event
 */
export interface AITokenUsageEventType extends EventType<"AI_TOKEN_USAGE"> {
  readonly userId: UserId;
}

/**
 * Add Key Event
 */
export interface AddKeyEventType extends EventType<"ADD_KEY"> {}

/**
 * Payment Event
 */
export interface PaymentEventType extends EventType<"PAYMENT"> {
  readonly userId: UserId;
}

/**
 * Payment Request Event
 */
export interface RequestPaymentEventType extends EventType<"REQUEST_PAYMENT"> {
  readonly userId: string;
}

/**
 * SDK Call Request Event
 */
export interface RequestSDKCallEventType extends EventType<"REQUEST_SDK_CALL"> {
  readonly userId: string;
}
