import { getPostgresDB } from "../../../db/postgres/db";
import {
  eventsTable,
  sdkCallEventsTable,
  aiTokenUsageEventsTable,
} from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import { eq, gt, gte, lt, lte, ne, and, or, sql, count, sum } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type {
  QueryRequest,
  QueryFilter,
  QueryFilterGroup,
  QueryResponse,
  QueryResultRow,
} from "../../../../interface/storage/Storage";

type EventTypeName = "SDK_CALL" | "AI_TOKEN_USAGE";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyColumn = any;

function applyOp(col: AnyColumn, filter: QueryFilter): SQL {
  switch (filter.operator) {
    case "EQ":
      return eq(col, filter.value);
    case "GT":
      return gt(col, filter.value);
    case "GTE":
      return gte(col, filter.value);
    case "LT":
      return lt(col, filter.value);
    case "LTE":
      return lte(col, filter.value);
    case "NEQ":
      return ne(col, filter.value);
    default:
      return eq(col, filter.value);
  }
}

function buildSdkCallConditionsFromGroup(
  group: QueryFilterGroup
): SQL | undefined {
  return buildConditionsFromGroup(group, (filter) => {
    switch (filter.field) {
      case "reportedTimestamp":
        return applyOp(eventsTable.reported_timestamp, filter);
      case "ingestedTimestamp":
        return applyOp(eventsTable.ingested_timestamp, filter);
      case "userId":
        return applyOp(eventsTable.userId, filter);
      case "apiKeyId":
        return applyOp(eventsTable.api_keyId, filter);
      case "sdkCallType":
        return applyOp(sdkCallEventsTable.type, filter);
      case "debitAmount":
        return applyOp(sdkCallEventsTable.debitAmount, filter);
      default:
        return null;
    }
  });
}

function buildAiTokenConditionsFromGroup(
  group: QueryFilterGroup
): SQL | undefined {
  return buildConditionsFromGroup(group, (filter) => {
    switch (filter.field) {
      case "reportedTimestamp":
        return applyOp(eventsTable.reported_timestamp, filter);
      case "ingestedTimestamp":
        return applyOp(eventsTable.ingested_timestamp, filter);
      case "userId":
        return applyOp(eventsTable.userId, filter);
      case "apiKeyId":
        return applyOp(eventsTable.api_keyId, filter);
      case "model":
        return applyOp(aiTokenUsageEventsTable.model, filter);
      case "inputTokens":
        return applyOp(aiTokenUsageEventsTable.inputTokens, filter);
      case "outputTokens":
        return applyOp(aiTokenUsageEventsTable.outputTokens, filter);
      case "inputDebitAmount":
        return applyOp(
          aiTokenUsageEventsTable.inputDebitAmount,
          filter
        );
      case "outputDebitAmount":
        return applyOp(
          aiTokenUsageEventsTable.outputDebitAmount,
          filter
        );
      default:
        return null;
    }
  });
}

function buildConditionsFromGroup(
  group: QueryFilterGroup,
  resolveColumn: (filter: QueryFilter) => SQL | null
): SQL | undefined {
  const parts: SQL[] = [];

  for (const condition of group.conditions) {
    if (condition.field === "eventType") continue;
    const clause = resolveColumn(condition);
    if (clause) parts.push(clause);
  }

  for (const subGroup of group.groups) {
    const subWhere = buildConditionsFromGroup(subGroup, resolveColumn);
    if (subWhere) parts.push(subWhere);
  }

  if (parts.length === 0) return undefined;
  return group.logical === "OR" ? or(...parts) : and(...parts);
}

function getEventTypes(where: QueryFilterGroup): EventTypeName[] {
  const collect = (group: QueryFilterGroup): string[] => {
    const types: string[] = [];
    const et = group.conditions.find((c) => c.field === "eventType");
    if (et) types.push(et.value);
    for (const sub of group.groups) {
      types.push(...collect(sub));
    }
    return types;
  };

  const types = collect(where);
  if (types.length > 0) {
    return types.filter(
      (t): t is EventTypeName =>
        t === "SDK_CALL" || t === "AI_TOKEN_USAGE"
    );
  }
  return ["SDK_CALL", "AI_TOKEN_USAGE"];
}

function buildSdkCallSelect() {
  return {
    eventId: eventsTable.id,
    eventType: sql<string>`'SDK_CALL'`.as("eventType"),
    userId: eventsTable.userId,
    reportedTimestamp: eventsTable.reported_timestamp,
    ingestedTimestamp: eventsTable.ingested_timestamp,
    sdkCallType: sdkCallEventsTable.type,
    debitAmount: sdkCallEventsTable.debitAmount,
    creditAmount: sql<number>`NULL::integer`.as("creditAmount"),
    model: sql<string>`NULL`.as("model"),
    inputTokens: sql<number>`NULL::integer`.as("inputTokens"),
    outputTokens: sql<number>`NULL::integer`.as("outputTokens"),
    inputDebitAmount: sql<number>`NULL::integer`.as("inputDebitAmount"),
    outputDebitAmount: sql<number>`NULL::integer`.as("outputDebitAmount"),
  };
}

function buildAiTokenSelect() {
  return {
    eventId: eventsTable.id,
    eventType: sql<string>`'AI_TOKEN_USAGE'`.as("eventType"),
    userId: eventsTable.userId,
    reportedTimestamp: eventsTable.reported_timestamp,
    ingestedTimestamp: eventsTable.ingested_timestamp,
    sdkCallType: sql<string>`NULL`.as("sdkCallType"),
    debitAmount: sql<number>`NULL::integer`.as("debitAmount"),
    creditAmount: sql<number>`NULL::integer`.as("creditAmount"),
    model: aiTokenUsageEventsTable.model,
    inputTokens: aiTokenUsageEventsTable.inputTokens,
    outputTokens: aiTokenUsageEventsTable.outputTokens,
    inputDebitAmount: aiTokenUsageEventsTable.inputDebitAmount,
    outputDebitAmount: aiTokenUsageEventsTable.outputDebitAmount,
  };
}

function getSubtypeTable(eventType: EventTypeName): typeof sdkCallEventsTable | typeof aiTokenUsageEventsTable {
  if (eventType === "SDK_CALL") return sdkCallEventsTable;
  return aiTokenUsageEventsTable;
}

function getSelect(eventType: EventTypeName) {
  if (eventType === "SDK_CALL") return buildSdkCallSelect();
  return buildAiTokenSelect();
}

function getConditions(
  eventType: EventTypeName,
  where: QueryFilterGroup
): SQL | undefined {
  if (eventType === "SDK_CALL") return buildSdkCallConditionsFromGroup(where);
  return buildAiTokenConditionsFromGroup(where);
}

export async function handleQueryEvents(
  request: QueryRequest
): Promise<QueryResponse> {
  const db = getPostgresDB();
  const eventTypes = getEventTypes(request.where);
  const isAgg = !!request.aggregation;

  if (eventTypes.length === 0) {
    return { rows: [], total: 0 };
  }

  try {
    if (isAgg) {
      return await handleAggregationQuery(db, request, eventTypes);
    }
    return await handleListQuery(db, request, eventTypes);
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "type" in e &&
      (e as Record<string, unknown>).name === "StorageError"
    ) {
      throw e;
    }
    throw StorageError.queryFailed(
      "Failed to query Postgres events",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

async function queryListForType(
  db: ReturnType<typeof getPostgresDB>,
  request: QueryRequest,
  eventType: EventTypeName
): Promise<{ rows: QueryResultRow[]; total: number }> {
  const subtypeTable = getSubtypeTable(eventType);
  const selectCols = getSelect(eventType);
  const whereClause = getConditions(eventType, request.where);

  // Count
  const countResult = await db
    .select({ cnt: count() })
    .from(eventsTable)
    .innerJoin(subtypeTable, eq(eventsTable.id, subtypeTable.id))
    .where(whereClause)
    .execute();

  const total = Number(countResult[0]?.cnt ?? 0);

  // Data
  const rows = await db
    .select(selectCols)
    .from(eventsTable)
    .innerJoin(subtypeTable, eq(eventsTable.id, subtypeTable.id))
    .where(whereClause)
    .orderBy(sql`${eventsTable.reported_timestamp} DESC`)
    .execute();

  return { rows: rows as unknown as QueryResultRow[], total };
}

async function handleListQuery(
  db: ReturnType<typeof getPostgresDB>,
  request: QueryRequest,
  eventTypes: EventTypeName[]
): Promise<QueryResponse> {
  const allRows: QueryResultRow[] = [];
  let totalCount = 0;

  for (const eventType of eventTypes) {
    const result = await queryListForType(db, request, eventType);
    allRows.push(...result.rows);
    totalCount += result.total;
  }

  allRows.sort((a, b) => {
    const aTs = String(a.reportedTimestamp ?? "");
    const bTs = String(b.reportedTimestamp ?? "");
    return bTs.localeCompare(aTs);
  });

  const offset = request.offset ?? 0;
  const limit = request.limit ?? 100;
  const paginated = allRows.slice(offset, offset + limit);

  return { rows: paginated, total: totalCount };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveAggCol(eventType: EventTypeName, isSum: boolean, field?: string): any {
  if (isSum && field) {
    if (eventType === "SDK_CALL" && field === "debitAmount")
      return sum(sdkCallEventsTable.debitAmount).mapWith(Number);
    if (eventType === "AI_TOKEN_USAGE") {
      if (field === "inputDebitAmount")
        return sum(aiTokenUsageEventsTable.inputDebitAmount).mapWith(Number);
      if (field === "outputDebitAmount")
        return sum(aiTokenUsageEventsTable.outputDebitAmount).mapWith(Number);
      if (field === "inputTokens")
        return sum(aiTokenUsageEventsTable.inputTokens).mapWith(Number);
      if (field === "outputTokens")
        return sum(aiTokenUsageEventsTable.outputTokens).mapWith(Number);
    }
  }
  return count().mapWith(Number);
}

async function handleAggregationQuery(
  db: ReturnType<typeof getPostgresDB>,
  request: QueryRequest,
  eventTypes: EventTypeName[]
): Promise<QueryResponse> {
  const agg = request.aggregation!;
  const isSum = agg.type === "SUM";
  const rows: QueryResultRow[] = [];

  for (const eventType of eventTypes) {
    const subtypeTable = getSubtypeTable(eventType);
    const whereClause = getConditions(eventType, request.where);

    if (request.groupBy && request.groupBy !== "eventType") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let gbCol: any = null;
      if (eventType === "SDK_CALL") {
        if (request.groupBy === "sdkCallType") gbCol = sdkCallEventsTable.type;
        if (request.groupBy === "userId") gbCol = eventsTable.userId;
      }
      if (eventType === "AI_TOKEN_USAGE") {
        if (request.groupBy === "model") gbCol = aiTokenUsageEventsTable.model;
        if (request.groupBy === "userId") gbCol = eventsTable.userId;
      }
      if (!gbCol) continue;

      const aggCol = resolveAggCol(eventType, isSum, agg.field);

      const result = await db
        .select({
          group_value: gbCol,
          agg_value: aggCol,
        })
        .from(eventsTable)
        .innerJoin(subtypeTable, eq(eventsTable.id, subtypeTable.id))
        .where(whereClause)
        .groupBy(gbCol)
        .execute();

      for (const r of result) {
        rows.push({
          group_value: String(r.group_value ?? ""),
          agg_value: String(r.agg_value ?? "0"),
        });
      }
    } else {
      const aggCol = resolveAggCol(eventType, isSum, agg.field);

      const result = await db
        .select({ agg_value: aggCol })
        .from(eventsTable)
        .innerJoin(subtypeTable, eq(eventsTable.id, subtypeTable.id))
        .where(whereClause)
        .execute();

      const row: QueryResultRow = {};
      if (request.groupBy === "eventType") {
        row.group_value = eventType;
      }
      row.agg_value = String(result[0]?.agg_value ?? "0");
      rows.push(row);
    }
  }

  return { rows, total: rows.length };
}
