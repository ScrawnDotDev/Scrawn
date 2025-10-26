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

/**
 * Base Event interface - all events in the system extend this
 */
export interface EventType<T extends keyof EventDataMap = keyof EventDataMap> {
  type: T;
  userId: string;
  reported_timestamp: DateTime;
  data: EventDataMap[T];

  serialize(): string;
}

/**
 * Serverless Function Call Event
 */
export interface ServerlessFunctionCallEventType
  extends EventType<"SERVERLESS_FUNCTION_CALL"> {}
