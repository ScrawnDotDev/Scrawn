import { getClickHouseDB } from "../../../db/clickhouse";
import { StorageError } from "../../../../errors/storage";
import type {
  QueryRequest,
  QueryFilter,
  QueryResponse,
  QueryResultRow,
} from "../../../../interface/storage/Storage";

const CH_COLUMNS: Record<string, Record<string, string | null>> = {
  sdk_call_events: {
    eventId: "toString(id)",
    eventType: "'SDK_CALL'",
    userId: "user_id",
    reportedTimestamp: "toString(reported_timestamp)",
    ingestedTimestamp: "toString(ingested_timestamp)",
    sdkCallType: "sdk_call_type",
    debitAmount: "toString(debit_amount)",
    creditAmount: null,
    model: null,
    inputTokens: null,
    outputTokens: null,
    inputDebitAmount: null,
    outputDebitAmount: null,
  },
  ai_token_usage_events: {
    eventId: "toString(id)",
    eventType: "'AI_TOKEN_USAGE'",
    userId: "user_id",
    reportedTimestamp: "toString(reported_timestamp)",
    ingestedTimestamp: "toString(ingested_timestamp)",
    sdkCallType: null,
    debitAmount: null,
    creditAmount: null,
    model: "model",
    inputTokens: "toString(input_tokens)",
    outputTokens: "toString(output_tokens)",
    inputDebitAmount: "toString(input_debit_amount)",
    outputDebitAmount: "toString(output_debit_amount)",
  },
};

const FIELD_TO_CH_COLUMN: Record<string, Record<string, string>> = {
  sdk_call_events: {
    reportedTimestamp: "reported_timestamp",
    ingestedTimestamp: "ingested_timestamp",
    userId: "user_id",
    apiKeyId: "api_key_id",
    sdkCallType: "sdk_call_type",
    debitAmount: "debit_amount",
  },
  ai_token_usage_events: {
    reportedTimestamp: "reported_timestamp",
    ingestedTimestamp: "ingested_timestamp",
    userId: "user_id",
    apiKeyId: "api_key_id",
    model: "model",
    inputTokens: "input_tokens",
    outputTokens: "output_tokens",
    inputDebitAmount: "input_debit_amount",
    outputDebitAmount: "output_debit_amount",
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

function getTablesForRequest(filters: QueryFilter[]): string[] {
  const eventTypeFilter = filters.find((f) => f.field === "eventType");
  if (eventTypeFilter) {
    const v = eventTypeFilter.value;
    if (v === "SDK_CALL") return ["sdk_call_events"];
    if (v === "AI_TOKEN_USAGE") return ["ai_token_usage_events"];
    return [];
  }
  return ["sdk_call_events", "ai_token_usage_events"];
}

function isAggregationField(field: string, table: string): boolean {
  const cols = FIELD_TO_CH_COLUMN[table];
  return cols ? field in cols : false;
}

function buildSelectColumns(table: string, outputAliases: boolean): string {
  const cols = CH_COLUMNS[table];
  if (!cols) return "*";
  const parts: string[] = [];
  for (const [alias, expr] of Object.entries(cols)) {
    if (expr === null) {
      parts.push(`NULL as ${alias}`);
    } else if (outputAliases) {
      parts.push(`${expr} as ${alias}`);
    } else {
      parts.push(expr);
    }
  }
  return parts.join(", ");
}

function buildWhereClause(
  filters: QueryFilter[],
  table: string,
  params: Record<string, unknown>,
  paramIndex: { value: number }
): string {
  const clauses: string[] = [];
  for (const filter of filters) {
    if (filter.field === "eventType") continue;
    const col = FIELD_TO_CH_COLUMN[table]?.[filter.field];
    if (!col) continue;
    const op = OPERATOR_SQL[filter.operator];
    if (!op) continue;
    const paramName = `p_${paramIndex.value++}`;
    const paramType = CH_PARAM_TYPE[filter.field] ?? "String";
    clauses.push(`${col} ${op} {${paramName}:${paramType}}`);
    params[paramName] = filter.value;
  }
  return clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
}

export async function handleQueryEvents(
  request: QueryRequest
): Promise<QueryResponse> {
  const client = getClickHouseDB();
  const tables = getTablesForRequest(request.filters);
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
  const selects = tables.map(
    (t) => `SELECT ${buildSelectColumns(t, true)} FROM ${t}`
  );
  const wheres = tables.map((t) => {
    const idx = { value: paramIndex.value };
    const clause = buildWhereClause(request.filters, t, params, idx);
    paramIndex.value = idx.value;
    return clause;
  });

  const queries = tables.map((t, i) => {
    let q = `SELECT ${buildSelectColumns(t, true)} FROM ${t}`;
    if (wheres[i]) q += ` ${wheres[i]}`;
    return q;
  });

  const unionQuery = queries.join(" UNION ALL ");

  const orderLimitOffset = buildOrderLimitOffset(request, params, paramIndex);
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
      const gbCol = FIELD_TO_CH_COLUMN[t]?.[request.groupBy];
      if (gbCol) {
        cols.push(`${gbCol} as group_value`);
      } else if (request.groupBy === "eventType") {
        cols.push(
          `'${t === "sdk_call_events" ? "SDK_CALL" : "AI_TOKEN_USAGE"}' as group_value`
        );
      }
    }

    if (isSum && agg.field) {
      const aggCol = FIELD_TO_CH_COLUMN[t]?.[agg.field];
      if (aggCol) {
        cols.push(`${aggCol} as agg_value`);
      } else {
        cols.push("0 as agg_value");
      }
    } else {
      cols.push("1 as agg_value");
    }

    const idx = { value: paramIndex.value };
    let q = `SELECT ${cols.join(", ")} FROM ${t}`;
    const where = buildWhereClause(request.filters, t, params, idx);
    paramIndex.value = idx.value;
    if (where) q += ` ${where}`;
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
  const data = await rs.json<{ group_value?: string; agg_value: string }>();

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
    const idx = { value: paramIndex.value };
    let q = `SELECT count() as cnt FROM ${t}`;
    const where = buildWhereClause(request.filters, t, params, idx);
    paramIndex.value = idx.value;
    if (where) q += ` ${where}`;
    return q;
  });

  const query = `SELECT sum(cnt) as total FROM (${subQueries.join(" UNION ALL ")})`;

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
    if (typeof request.limit === "number") {
      parts.push(`LIMIT {${limitParam}:Int32}`);
      params[limitParam] = request.limit;
    }
  }

  if (request.offset) {
    const offsetParam = `p_${paramIndex.value++}`;
    if (typeof request.offset === "number") {
      parts.push(`OFFSET {${offsetParam}:Int32}`);
      params[offsetParam] = request.offset;
    }
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
