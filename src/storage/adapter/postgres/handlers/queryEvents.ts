import { getPostgresDB } from "../../../db/postgres/db";
import {
  eventsTable,
  sdkCallEventsTable,
  aiTokenUsageEventsTable,
  paymentEventsTable,
} from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import { eq, gt, gte, lt, lte, ne, and, sql, count, sum } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type {
  QueryRequest,
  QueryFilter,
  QueryResponse,
  QueryResultRow,
} from "../../../../interface/storage/Storage";

type EventTypeName = "SDK_CALL" | "AI_TOKEN_USAGE" | "PAYMENT";

// Accept any value that drizzle operators accept
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyColumn = any;

function applyEq(col: AnyColumn, v: string): SQL {
  return eq(col, v);
}
function applyGt(col: AnyColumn, v: string): SQL {
  return gt(col, v);
}
function applyGte(col: AnyColumn, v: string): SQL {
  return gte(col, v);
}
function applyLt(col: AnyColumn, v: string): SQL {
  return lt(col, v);
}
function applyLte(col: AnyColumn, v: string): SQL {
  return lte(col, v);
}
function applyNe(col: AnyColumn, v: string): SQL {
  return ne(col, v);
}

function applyOp(col: AnyColumn, filter: QueryFilter): SQL {
  switch (filter.operator) {
    case "EQ":
      return applyEq(col, filter.value);
    case "GT":
      return applyGt(col, filter.value);
    case "GTE":
      return applyGte(col, filter.value);
    case "LT":
      return applyLt(col, filter.value);
    case "LTE":
      return applyLte(col, filter.value);
    case "NEQ":
      return applyNe(col, filter.value);
    default:
      return applyEq(col, filter.value);
  }
}

function buildSdkCallConditions(filters: QueryFilter[]): SQL[] {
  const conditions: SQL[] = [];
  for (const filter of filters) {
    if (filter.field === "eventType") continue;
    switch (filter.field) {
      case "reportedTimestamp":
        conditions.push(applyOp(eventsTable.reported_timestamp, filter));
        break;
      case "ingestedTimestamp":
        conditions.push(applyOp(eventsTable.ingested_timestamp, filter));
        break;
      case "userId":
        conditions.push(applyOp(eventsTable.userId, filter));
        break;
      case "apiKeyId":
        conditions.push(applyOp(eventsTable.api_keyId, filter));
        break;
      case "sdkCallType":
        conditions.push(applyOp(sdkCallEventsTable.type, filter));
        break;
      case "debitAmount":
        conditions.push(applyOp(sdkCallEventsTable.debitAmount, filter));
        break;
    }
  }
  return conditions;
}

function buildAiTokenConditions(filters: QueryFilter[]): SQL[] {
  const conditions: SQL[] = [];
  for (const filter of filters) {
    if (filter.field === "eventType") continue;
    switch (filter.field) {
      case "reportedTimestamp":
        conditions.push(applyOp(eventsTable.reported_timestamp, filter));
        break;
      case "ingestedTimestamp":
        conditions.push(applyOp(eventsTable.ingested_timestamp, filter));
        break;
      case "userId":
        conditions.push(applyOp(eventsTable.userId, filter));
        break;
      case "apiKeyId":
        conditions.push(applyOp(eventsTable.api_keyId, filter));
        break;
      case "model":
        conditions.push(applyOp(aiTokenUsageEventsTable.model, filter));
        break;
      case "inputTokens":
        conditions.push(applyOp(aiTokenUsageEventsTable.inputTokens, filter));
        break;
      case "outputTokens":
        conditions.push(applyOp(aiTokenUsageEventsTable.outputTokens, filter));
        break;
      case "inputDebitAmount":
        conditions.push(
          applyOp(aiTokenUsageEventsTable.inputDebitAmount, filter)
        );
        break;
      case "outputDebitAmount":
        conditions.push(
          applyOp(aiTokenUsageEventsTable.outputDebitAmount, filter)
        );
        break;
    }
  }
  return conditions;
}

function buildPaymentConditions(filters: QueryFilter[]): SQL[] {
  const conditions: SQL[] = [];
  for (const filter of filters) {
    if (filter.field === "eventType") continue;
    switch (filter.field) {
      case "reportedTimestamp":
        conditions.push(applyOp(eventsTable.reported_timestamp, filter));
        break;
      case "ingestedTimestamp":
        conditions.push(applyOp(eventsTable.ingested_timestamp, filter));
        break;
      case "userId":
        conditions.push(applyOp(eventsTable.userId, filter));
        break;
      case "apiKeyId":
        conditions.push(applyOp(eventsTable.api_keyId, filter));
        break;
      case "creditAmount":
        conditions.push(applyOp(paymentEventsTable.creditAmount, filter));
        break;
    }
  }
  return conditions;
}

function getEventTypes(filters: QueryFilter[]): EventTypeName[] {
  const eventTypeFilter = filters.find((f) => f.field === "eventType");
  if (eventTypeFilter) {
    const v = eventTypeFilter.value;
    if (v === "SDK_CALL" || v === "AI_TOKEN_USAGE" || v === "PAYMENT") {
      return [v];
    }
    return [];
  }
  return ["SDK_CALL", "AI_TOKEN_USAGE", "PAYMENT"];
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

function buildPaymentSelect() {
  return {
    eventId: eventsTable.id,
    eventType: sql<string>`'PAYMENT'`.as("eventType"),
    userId: eventsTable.userId,
    reportedTimestamp: eventsTable.reported_timestamp,
    ingestedTimestamp: eventsTable.ingested_timestamp,
    sdkCallType: sql<string>`NULL`.as("sdkCallType"),
    debitAmount: sql<number>`NULL::integer`.as("debitAmount"),
    creditAmount: paymentEventsTable.creditAmount,
    model: sql<string>`NULL`.as("model"),
    inputTokens: sql<number>`NULL::integer`.as("inputTokens"),
    outputTokens: sql<number>`NULL::integer`.as("outputTokens"),
    inputDebitAmount: sql<number>`NULL::integer`.as("inputDebitAmount"),
    outputDebitAmount: sql<number>`NULL::integer`.as("outputDebitAmount"),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSubtypeTable(eventType: EventTypeName): any {
  if (eventType === "SDK_CALL") return sdkCallEventsTable;
  if (eventType === "AI_TOKEN_USAGE") return aiTokenUsageEventsTable;
  return paymentEventsTable;
}

function getSelect(eventType: EventTypeName) {
  if (eventType === "SDK_CALL") return buildSdkCallSelect();
  if (eventType === "AI_TOKEN_USAGE") return buildAiTokenSelect();
  return buildPaymentSelect();
}

function getConditions(
  eventType: EventTypeName,
  filters: QueryFilter[]
): SQL[] {
  if (eventType === "SDK_CALL") return buildSdkCallConditions(filters);
  if (eventType === "AI_TOKEN_USAGE") return buildAiTokenConditions(filters);
  return buildPaymentConditions(filters);
}

export async function handleQueryEvents(
  request: QueryRequest
): Promise<QueryResponse> {
  const db = getPostgresDB();
  const eventTypes = getEventTypes(request.filters);
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
  const whereConditions = getConditions(eventType, request.filters);
  const whereClause =
    whereConditions.length > 0 ? and(...whereConditions) : undefined;

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
    const whereConditions = getConditions(eventType, request.filters);
    const whereClause =
      whereConditions.length > 0 ? and(...whereConditions) : undefined;

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
      if (eventType === "PAYMENT") {
        if (request.groupBy === "userId") gbCol = eventsTable.userId;
      }
      if (!gbCol) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let aggCol: any;
      if (isSum && agg.field) {
        if (eventType === "SDK_CALL" && agg.field === "debitAmount")
          aggCol = sum(sdkCallEventsTable.debitAmount).mapWith(Number);
        else if (eventType === "AI_TOKEN_USAGE") {
          if (agg.field === "inputDebitAmount")
            aggCol = sum(aiTokenUsageEventsTable.inputDebitAmount).mapWith(
              Number
            );
          else if (agg.field === "outputDebitAmount")
            aggCol = sum(aiTokenUsageEventsTable.outputDebitAmount).mapWith(
              Number
            );
          else if (agg.field === "inputTokens")
            aggCol = sum(aiTokenUsageEventsTable.inputTokens).mapWith(Number);
          else if (agg.field === "outputTokens")
            aggCol = sum(aiTokenUsageEventsTable.outputTokens).mapWith(Number);
          else aggCol = count().mapWith(Number);
        } else if (eventType === "PAYMENT" && agg.field === "creditAmount")
          aggCol = sum(paymentEventsTable.creditAmount).mapWith(Number);
        else aggCol = count().mapWith(Number);
      } else {
        aggCol = count().mapWith(Number);
      }

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let aggCol: any;
      if (isSum && agg.field) {
        if (eventType === "SDK_CALL" && agg.field === "debitAmount")
          aggCol = sum(sdkCallEventsTable.debitAmount).mapWith(Number);
        else if (eventType === "AI_TOKEN_USAGE") {
          if (agg.field === "inputDebitAmount")
            aggCol = sum(aiTokenUsageEventsTable.inputDebitAmount).mapWith(
              Number
            );
          else if (agg.field === "outputDebitAmount")
            aggCol = sum(aiTokenUsageEventsTable.outputDebitAmount).mapWith(
              Number
            );
          else if (agg.field === "inputTokens")
            aggCol = sum(aiTokenUsageEventsTable.inputTokens).mapWith(Number);
          else if (agg.field === "outputTokens")
            aggCol = sum(aiTokenUsageEventsTable.outputTokens).mapWith(Number);
          else aggCol = count().mapWith(Number);
        } else if (eventType === "PAYMENT" && agg.field === "creditAmount")
          aggCol = sum(paymentEventsTable.creditAmount).mapWith(Number);
        else aggCol = count().mapWith(Number);
      } else {
        aggCol = count().mapWith(Number);
      }

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
