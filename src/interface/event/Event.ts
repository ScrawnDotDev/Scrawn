import { DateTime } from "luxon";
import { type EventSchemaType } from "../../zod/event";

export type SDKCallEventData = {
  sdkCallType: EventSchemaType["data"]["sdkCallType"];
  debitAmount: number;
};

export type AddKeyEventData = {
  name: string;
  key: string;
  expiresAt: string;
};

/**
 * Mapping of event types to their data structures
 */
export type EventDataMap = {
  SDK_CALL: SDKCallEventData;
  ADD_KEY: AddKeyEventData;
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
  SDK_CALL: BaseEventMetadata<"SDK_CALL"> & { userId: string };
};

type EventStorageAdapterMap<Type extends keyof EventDataMap> = {
  SQL: {
    [K in keyof EventDataMap]: EventMetadataMap[K];
  }[Type];
};

export type EventStorageAdapterUnion<T extends keyof EventDataMap> = {
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
  readonly userId: string;
}

/**
 * Add Key Event
 */
export interface AddKeyEventType extends EventType<"ADD_KEY"> {}