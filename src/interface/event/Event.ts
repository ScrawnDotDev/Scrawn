import type { DateTime } from "luxon";
import { type EventSchemaType } from "../../zod/event";

export type SDKCallEventData = {
  sdkCallType: EventSchemaType["data"]["sdkCallType"];
  debitAmount: number;
};

/**
 * Mapping of event types to their data structures
 */
type EventDataMap = {
  SDK_CALL: SDKCallEventData;
};

type EventStorageAdapterMap<
  Type extends keyof EventDataMap = keyof EventDataMap,
> = {
  SQL: {
    type: Type;
    userId: string;
    reported_timestamp: DateTime;
    data: EventDataMap[Type];
  };
};

/**
 * Base Event interface - all events in the system extend this
 */
export interface EventType<
  Type extends keyof EventDataMap = keyof EventDataMap,
> {
  type: Type;
  readonly userId: string;
  readonly reported_timestamp: DateTime;
  readonly data: EventDataMap[Type];

  serialize(): Record<
    keyof EventStorageAdapterMap<Type>,
    EventStorageAdapterMap<Type>[keyof EventStorageAdapterMap<Type>]
  >;
}

/**
 * SDK Call Event
 */
export interface SDKCallEventType extends EventType<"SDK_CALL"> {}
