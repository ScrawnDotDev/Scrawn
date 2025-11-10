import { DateTime } from "luxon";
import { type EventSchemaType } from "../../zod/event";
import { type UserId } from "../../config/identifiers";

export type SDKCallEventData = {
  sdkCallType: EventSchemaType["data"]["sdkCallType"];
  debitAmount: number;
};

export type AddKeyEventData = {
  name: string;
  key: string;
  expiresAt: string;
};

export type RequestPaymentEventData = null;

export type RequestSDKCallEventData = null;

/**
 * Mapping of event types to their data structures
 */
type EventDataMap = {
  SDK_CALL: SDKCallEventData;
  ADD_KEY: AddKeyEventData;
  REQUEST_PAYMENT: RequestPaymentEventData;
  REQUEST_SDK_CALL: RequestSDKCallEventData;
};

export type EventUnion<T extends keyof EventDataMap> = {
  [K in keyof EventDataMap]: EventDataMap[K];
}[T];

type BaseEventMetadata<T extends keyof EventDataMap> = {
  type: T;
  reported_timestamp: DateTime;
  data: EventDataMap[T];
};

type EventMetadataMap = {
  ADD_KEY: BaseEventMetadata<"ADD_KEY">;
  SDK_CALL: BaseEventMetadata<"SDK_CALL"> & { userId: UserId };
  REQUEST_PAYMENT: BaseEventMetadata<"REQUEST_PAYMENT"> & { userId: UserId };
  REQUEST_SDK_CALL: BaseEventMetadata<"REQUEST_SDK_CALL"> & { userId: UserId };
};

type EventStorageAdapterMap<Type extends keyof EventDataMap> = {
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
 * Add Key Event
 */
export interface AddKeyEventType extends EventType<"ADD_KEY"> {}

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
