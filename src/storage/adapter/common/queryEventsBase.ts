import type { QueryFilterGroup } from "../../../interface/storage/Storage";

export type EventTypeLabel = "BASIC_USAGE" | "AI_TOKEN_USAGE" | "PAYMENT";

export type EventTableName =
  | "basic_usage_events"
  | "ai_token_usage_events"
  | "payment_events";

export const EVENT_TYPE_TO_TABLE: Record<EventTypeLabel, EventTableName> = {
  BASIC_USAGE: "basic_usage_events",
  AI_TOKEN_USAGE: "ai_token_usage_events",
  PAYMENT: "payment_events",
};

export const TABLE_TO_EVENT_TYPE: Record<EventTableName, EventTypeLabel> = {
  basic_usage_events: "BASIC_USAGE",
  ai_token_usage_events: "AI_TOKEN_USAGE",
  payment_events: "PAYMENT",
};

export const ALL_EVENT_TYPES: EventTypeLabel[] = [
  "BASIC_USAGE",
  "AI_TOKEN_USAGE",
  "PAYMENT",
];

export const ALL_TABLES: EventTableName[] = [
  "basic_usage_events",
  "ai_token_usage_events",
  "payment_events",
];

export const OPERATOR_SQL: Record<string, string> = {
  EQ: "=",
  GT: ">",
  GTE: ">=",
  LT: "<",
  LTE: "<=",
  NEQ: "!=",
};

function collectRawEventTypeValues(group: QueryFilterGroup): string[] {
  const values: string[] = [];
  const et = group.conditions.find((c) => c.field === "eventType");
  if (et) values.push(et.value);
  for (const sub of group.groups) {
    values.push(...collectRawEventTypeValues(sub));
  }
  return values;
}

export function getTablesForRequest(
  where: QueryFilterGroup
): EventTableName[] {
  const rawValues = collectRawEventTypeValues(where);
  if (rawValues.length === 0) {
    return [...ALL_TABLES];
  }
  const valid = rawValues.filter(
    (t): t is EventTypeLabel => t in EVENT_TYPE_TO_TABLE
  );
  return valid.map((et) => EVENT_TYPE_TO_TABLE[et]);
}
