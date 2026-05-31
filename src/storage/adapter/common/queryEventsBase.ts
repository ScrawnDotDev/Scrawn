import type {
  QueryFilterGroup,
  QueryFilter,
} from "../../../interface/storage/Storage";

export type EventTypeLabel = "BASIC_USAGE" | "AI_TOKEN_USAGE" | "PAYMENT";

export type EventTableName =
  | "basic_usage_events"
  | "ai_token_usage_events"
  | "payment_events";

const EVENT_TYPE_TO_TABLE: Record<EventTypeLabel, EventTableName> = {
  BASIC_USAGE: "basic_usage_events",
  AI_TOKEN_USAGE: "ai_token_usage_events",
  PAYMENT: "payment_events",
};

export const TABLE_TO_EVENT_TYPE: Record<EventTableName, EventTypeLabel> = {
  basic_usage_events: "BASIC_USAGE",
  ai_token_usage_events: "AI_TOKEN_USAGE",
  payment_events: "PAYMENT",
};

const ALL_EVENT_TYPES: EventTypeLabel[] = [
  "BASIC_USAGE",
  "AI_TOKEN_USAGE",
  "PAYMENT",
];

const ALL_TABLES: EventTableName[] = [
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

interface EventTypeFilter {
  operator: string;
  value: string;
}

function collectEventTypeFilters(group: QueryFilterGroup): EventTypeFilter[] {
  const filters: EventTypeFilter[] = [];
  for (const c of group.conditions) {
    if (c.field === "eventType") {
      filters.push({ operator: c.operator, value: c.value });
    }
  }
  for (const sub of group.groups) {
    filters.push(...collectEventTypeFilters(sub));
  }
  return filters;
}

export function getTablesForRequest(where: QueryFilterGroup): EventTableName[] {
  const filters = collectEventTypeFilters(where);
  if (filters.length === 0) {
    return [...ALL_TABLES];
  }

  const included = new Set<EventTableName>();
  const excluded = new Set<EventTableName>();

  for (const { operator, value } of filters) {
    if (!(value in EVENT_TYPE_TO_TABLE)) continue;
    const table = EVENT_TYPE_TO_TABLE[value as EventTypeLabel];
    if (operator === "EQ") {
      included.add(table);
    } else if (operator === "NEQ") {
      excluded.add(table);
    }
  }

  if (included.size > 0) {
    return [...included];
  }

  if (excluded.size > 0) {
    return ALL_TABLES.filter((t) => !excluded.has(t));
  }

  return [];
}
