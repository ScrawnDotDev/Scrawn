import type { DateTime } from "luxon";
import { type StorageAdapterType } from "../storage/Storage";

type ServerlessFunctionCallEventData = {
  debitAmount: number;
};

/**
 * Mapping of event types to their data structures
 */
type EventDataMap = {
  SERVERLESS_FUNCTION_CALL: ServerlessFunctionCallEventData;
};

type EventStorageAdapterMap<Type extends keyof EventDataMap = keyof EventDataMap> = {
  POSTGRES: {
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
 * Serverless Function Call Event
 */
export interface ServerlessFunctionCallEventType
  extends EventType<"SERVERLESS_FUNCTION_CALL"> {}
