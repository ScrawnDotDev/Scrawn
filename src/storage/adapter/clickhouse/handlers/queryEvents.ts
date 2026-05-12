import { getClickHouseDB } from "../../../db/clickhouse";
import { StorageError } from "../../../../errors/storage";
import { DateTime } from "luxon";
import { toClickHouseDateTime } from "../utils";
import type {
  QueryRequest,
  QueryFilter,
  QueryFilterGroup,
  QueryResponse,
  QueryResultRow,
} from "../../../../interface/storage/Storage";

interface ChFieldDef {
  select: string | null;
  where?: string;
}

const CH_FIELDS: Record<string, Record<string, ChFieldDef>> = {
  sdk_call_events: {
    eventId:           { select: "toString(id)" },
    eventType:         { select: "'SDK_CALL'" },
    userId:            { select: "user_id", where: "user_id" },
    apiKeyId:          { select: "api_key_id", where: "api_key_id" },
    reportedTimestamp: { select: "toString(reported_timestamp)", where: "reported_timestamp" },
    ingestedTimestamp: { select: "toString(ingested_timestamp)", where: "ingested_timestamp" },
    sdkCallType:       { select: "sdk_call_type", where: "sdk_call_type" },
    debitAmount:       { select: "toString(debit_amount)", where: "debit_amount" },
    creditAmount:      { select: null },
    model:             { select: null },
    inputTokens:       { select: null },
    outputTokens:      { select: null },
    inputDebitAmount:  { select: null },
    outputDebitAmount: { select: null },
  },
  ai_token_usage_events: {
    eventId:           { select: "toString(id)" },
    eventType:         { select: "'AI_TOKEN_USAGE'" },
    userId:            { select: "user_id", where: "user_id" },
    apiKeyId:          { select: "api_key_id", where: "api_key_id" },
    reportedTimestamp: { select: "toString(reported_timestamp)", where: "reported_timestamp" },
    ingestedTimestamp: { select: "toString(ingested_timestamp)", where: "ingested_timestamp" },
    sdkCallType:       { select: null },
    debitAmount:       { select: null },
    creditAmount:      { select: null },
    model:             { select: "model", where: "model" },
    inputTokens:       { select: "toString(input_tokens)", where: "input_tokens" },
    outputTokens:      { select: "toString(output_tokens)", where: "output_tokens" },
    inputDebitAmount:  { select: "toString(input_debit_amount)", where: "input_debit_amount" },
    outputDebitAmount: { select: "toString(output_debit_amount)", where: "output_debit_amount" },
  },
};

const CH_PARAM_TYPE: Record<string, string> = {
  reportedTimestamp: "DateTime64(3, 'UTC')",
  ingestedTimestamp: "DateTime64(3, 'UTC')",
  userId: "String",
  apiKeyId: "String",
  sdkCallType: "String",
  debitAmount: "Int64",
  creditAmount: "Int64",
  model: "String",
  inputTokens: "Int64",
  outputTokens: "Int64",
  inputDebitAmount: "Int64",
  outputDebitAmount: "Int64",
};

const OPERATOR_SQL: Record<string, string> = {
  EQ: "=",
  GT: ">",
  GTE: ">=",
  LT: "<",
  LTE: "<=",
  NEQ: "!=",
};

function getTablesForRequest(where: QueryFilterGroup): string[] {
  const eventTypes = collectEventTypes(where);
  if (eventTypes.length > 0) {
    const tables: string[] = [];
    if (eventTypes.includes("SDK_CALL")) tables.push("sdk_call_events");
    if (eventTypes.includes("AI_TOKEN_USAGE"))
      tables.push("ai_token_usage_events");
    return tables;
  }
  return ["sdk_call_events", "ai_token_usage_events"];
}

function collectEventTypes(group: QueryFilterGroup): string[] {
  const types: string[] = [];
  const et = group.conditions.find((c) => c.field === "eventType");
  if (et) types.push(et.value);
  for (const sub of group.groups) {
    types.push(...collectEventTypes(sub));
  }
  return types;
}

function buildSelectColumns(table: string, outputAliases: boolean): string {
  const defs = CH_FIELDS[table];
  if (!defs) return "*";
  const parts: string[] = [];
  for (const [alias, def] of Object.entries(defs)) {
    if (def.select === null) {
      parts.push(`NULL as ${alias}`);
    } else if (outputAliases) {
      parts.push(`${def.select} as ${alias}`);
    } else {
      parts.push(def.select);
    }
  }
  return parts.join(", ");
}

function buildGroupCondition(
  condition: QueryFilter,
  table: string,
  params: Record<string, unknown>,
  paramIndex: { value: number }
): string | null {
  const col = CH_FIELDS[table]?.[condition.field]?.where;
  if (!col) return null;
  const op = OPERATOR_SQL[condition.operator];
  if (!op) return null;
  const paramName = `p_${paramIndex.value++}`;
  const paramType = CH_PARAM_TYPE[condition.field] ?? "String";

  let value: string | number = condition.value;
  if (condition.field === "reportedTimestamp" || condition.field === "ingestedTimestamp") {
    const dt = DateTime.fromISO(condition.value);
    if (dt.isValid) {
      value = toClickHouseDateTime(dt);
    }
  }
  params[paramName] = value;

  return `${col} ${op} {${paramName}:${paramType}}`;
}

function buildWhereFromGroup(
  group: QueryFilterGroup,
  table: string,
  params: Record<string, unknown>,
  paramIndex: { value: number }
): string {
  const parts: string[] = [];

  for (const condition of group.conditions) {
    if (condition.field === "eventType") continue;
    const clause = buildGroupCondition(
      condition,
      table,
      params,
      paramIndex
    );
    if (clause) parts.push(clause);
  }

  for (const subGroup of group.groups) {
    const subClause = buildWhereFromGroup(
      subGroup,
      table,
      params,
      paramIndex
    );
    if (subClause) parts.push(`(${subClause})`);
  }

  if (parts.length === 0) return "";
  const joiner = group.logical === "OR" ? " OR " : " AND ";
  return parts.join(joiner);
}

export async function handleQueryEvents(
  request: QueryRequest
): Promise<QueryResponse> {
  const client = getClickHouseDB();
  const tables = getTablesForRequest(request.where);
  const isAgg = !!request.aggregation;

  if (tables.length === 0) {
    return { rows: [], total: 0 };
  }

  try {
    if (isAgg) {
      return await handleAggregationQuery(client, request, tables);
    }
    return await handleListQuery(client, request, tables);
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
      "Failed to query ClickHouse events",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

async function handleListQuery(
  client: ReturnType<typeof getClickHouseDB>,
  request: QueryRequest,
  tables: string[]
): Promise<QueryResponse> {
  const paramIndex = { value: 0 };
  const params: Record<string, unknown> = {};

  const queries = tables.map((t) => {
    const whereClause = buildWhereFromGroup(
      request.where,
      t,
      params,
      paramIndex
    );
    let q = `SELECT ${buildSelectColumns(t, true)} FROM ${t}`;
    if (whereClause) q += ` WHERE ${whereClause}`;
    return q;
  });

  const unionQuery = queries.join(" UNION ALL ");
  const orderLimitOffset = buildOrderLimitOffset(
    request,
    params,
    paramIndex
  );
  const finalQuery = `${unionQuery} ${orderLimitOffset}`;

  const rs = await client.query({
    query: finalQuery,
    query_params: params,
    format: "JSONEachRow",
  });
  const data = await rs.json<Record<string, string>>();

  const rows: QueryResultRow[] = (
    data as unknown as Record<string, string>[]
  ).map(normalizeRow);

  const total = await getTotalCount(client, request, tables);

  return { rows, total };
}

async function handleAggregationQuery(
  client: ReturnType<typeof getClickHouseDB>,
  request: QueryRequest,
  tables: string[]
): Promise<QueryResponse> {
  const agg = request.aggregation!;
  const isSum = agg.type === "SUM";
  const paramIndex = { value: 0 };
  const params: Record<string, unknown> = {};

  const subQueries = tables.map((t) => {
    const cols: string[] = [];

    if (request.groupBy) {
      const gbCol = CH_FIELDS[t]?.[request.groupBy]?.where;
      if (gbCol) {
        cols.push(`${gbCol} as group_value`);
      } else if (request.groupBy === "eventType") {
        cols.push(
          `'${t === "sdk_call_events" ? "SDK_CALL" : "AI_TOKEN_USAGE"}' as group_value`
        );
      }
    }

    if (isSum && agg.field) {
      const aggCol = CH_FIELDS[t]?.[agg.field]?.where;
      if (aggCol) {
        cols.push(`${aggCol} as agg_value`);
      } else {
        cols.push("0 as agg_value");
      }
    } else {
      cols.push("1 as agg_value");
    }

    const whereClause = buildWhereFromGroup(
      request.where,
      t,
      params,
      paramIndex
    );
    let q = `SELECT ${cols.join(", ")} FROM ${t}`;
    if (whereClause) q += ` WHERE ${whereClause}`;
    return q;
  });

  const unionQuery = subQueries.join(" UNION ALL ");

  let outerSelect: string;
  const groupByClause = request.groupBy ? "GROUP BY group_value" : "";
  if (isSum) {
    outerSelect = request.groupBy
      ? "SELECT group_value, toString(sum(toInt64(agg_value))) as agg_value"
      : "SELECT toString(sum(toInt64(agg_value))) as agg_value";
  } else {
    outerSelect = request.groupBy
      ? "SELECT group_value, toString(count()) as agg_value"
      : "SELECT toString(count()) as agg_value";
  }

  const finalQuery = `SELECT * FROM (${outerSelect} FROM (${unionQuery}) ${groupByClause})`;

  const rs = await client.query({
    query: finalQuery,
    query_params: params,
    format: "JSONEachRow",
  });
  const data = await rs.json<{
    group_value?: string;
    agg_value: string;
  }>();

  const rows: QueryResultRow[] = (
    data as unknown as Record<string, string>[]
  ).map((r) => ({
    group_value: r.group_value ?? null,
    agg_value: r.agg_value ?? "0",
  }));

  return { rows, total: rows.length };
}

async function getTotalCount(
  client: ReturnType<typeof getClickHouseDB>,
  request: QueryRequest,
  tables: string[]
): Promise<number> {
  const paramIndex = { value: 0 };
  const params: Record<string, unknown> = {};

  const subQueries = tables.map((t) => {
    const whereClause = buildWhereFromGroup(
      request.where,
      t,
      params,
      paramIndex
    );
    let q = `SELECT count() as cnt FROM ${t}`;
    if (whereClause) q += ` WHERE ${whereClause}`;
    return q;
  });

  const query = `SELECT sum(cnt) as total FROM (${subQueries.join(
    " UNION ALL "
  )})`;

  const rs = await client.query({
    query,
    query_params: params,
    format: "JSONEachRow",
  });
  const data = await rs.json<{ total: string }>();

  if (!data || data.length === 0 || !data[0]?.total) return 0;
  const parsed = parseInt(data[0].total);
  return isNaN(parsed) ? 0 : parsed;
}

function buildOrderLimitOffset(
  request: QueryRequest,
  params: Record<string, unknown>,
  paramIndex: { value: number }
): string {
  const parts: string[] = [];
  parts.push("ORDER BY reportedTimestamp DESC");

  if (request.limit) {
    const limitParam = `p_${paramIndex.value++}`;
    parts.push(`LIMIT {${limitParam}:Int32}`);
    params[limitParam] = request.limit;
  }

  if (request.offset) {
    const offsetParam = `p_${paramIndex.value++}`;
    parts.push(`OFFSET {${offsetParam}:Int32}`);
    params[offsetParam] = request.offset;
  }

  return parts.join(" ");
}

function normalizeRow(row: Record<string, string>): QueryResultRow {
  const result: QueryResultRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined || value === "\\N") {
      result[key] = null;
    } else {
      result[key] = value;
    }
  }
  return result;
}
