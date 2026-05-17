import { getClickHouseDB } from "../../../db/clickhouse";
import { StorageError } from "../../../../errors/storage";
import { DateTime } from "luxon";
import { toClickHouseDateTime } from "../utils";
import {
  getTablesForRequest,
  OPERATOR_SQL,
  TABLE_TO_EVENT_TYPE,
  type EventTableName,
} from "../../common/queryEventsBase";
import type {
  QueryRequest,
  QueryFilterGroup,
  QueryResponse,
  QueryResultRow,
  QueryFieldName,
} from "../../../../interface/storage/Storage";

interface ChFieldDef {
  select: string | null;
  where: string | null;
}

type ChFieldKey = QueryFieldName | "eventId";

const CH_FIELDS: Record<EventTableName, Record<ChFieldKey, ChFieldDef>> = {
  basic_usage_events: {
    eventId: { select: "toString(id)", where: "id" },
    eventType: { select: "'BASIC_USAGE'", where: null },
    userId: { select: "user_id", where: "user_id" },
    apiKeyId: { select: "api_key_id", where: "api_key_id" },
    reportedTimestamp: {
      select: "toString(reported_timestamp)",
      where: "reported_timestamp",
    },
    ingestedTimestamp: {
      select: "toString(ingested_timestamp)",
      where: "ingested_timestamp",
    },
    basicUsageType: { select: "type", where: "type" },
    debitAmount: { select: "toString(debit_amount)", where: "debit_amount" },
    model: { select: null, where: null },
    inputTokens: { select: null, where: null },
    outputTokens: { select: null, where: null },
    inputDebitAmount: { select: null, where: null },
    outputDebitAmount: { select: null, where: null },
    inputCacheTokens: { select: null, where: null },
    inputCacheDebitAmount: { select: null, where: null },
    creditAmount: { select: null, where: null },
    provider: { select: null, where: null },
    metadata: { select: null, where: null },
  },
  ai_token_usage_events: {
    eventId: { select: "toString(id)", where: "id" },
    eventType: { select: "'AI_TOKEN_USAGE'", where: null },
    userId: { select: "user_id", where: "user_id" },
    apiKeyId: { select: "api_key_id", where: "api_key_id" },
    reportedTimestamp: {
      select: "toString(reported_timestamp)",
      where: "reported_timestamp",
    },
    ingestedTimestamp: {
      select: "toString(ingested_timestamp)",
      where: "ingested_timestamp",
    },
    basicUsageType: { select: null, where: null },
    debitAmount: {
      select:
        "toString(JSONExtractInt(metrics, 'debit_amount', 'input') + JSONExtractInt(metrics, 'debit_amount', 'input_cache') + JSONExtractInt(metrics, 'debit_amount', 'output'))",
      where: null,
    },
    model: { select: "model", where: "model" },
    inputTokens: {
      select: "toString(JSONExtractInt(metrics, 'tokens', 'input'))",
      where: null,
    },
    outputTokens: {
      select: "toString(JSONExtractInt(metrics, 'tokens', 'output'))",
      where: null,
    },
    inputDebitAmount: {
      select: "toString(JSONExtractInt(metrics, 'debit_amount', 'input'))",
      where: null,
    },
    outputDebitAmount: {
      select: "toString(JSONExtractInt(metrics, 'debit_amount', 'output'))",
      where: null,
    },
    inputCacheTokens: {
      select: "toString(JSONExtractInt(metrics, 'tokens', 'input_cache'))",
      where: null,
    },
    inputCacheDebitAmount: {
      select:
        "toString(JSONExtractInt(metrics, 'debit_amount', 'input_cache'))",
      where: null,
    },
    creditAmount: { select: null, where: null },
    provider: { select: "provider", where: "provider" },
    metadata:          { select: "toString(metadata)",                      where: null },
  },
  payment_events: {
    eventId: { select: "toString(id)", where: "id" },
    eventType: { select: "'PAYMENT'", where: null },
    userId: { select: "user_id", where: "user_id" },
    apiKeyId: { select: "api_key_id", where: "api_key_id" },
    reportedTimestamp: {
      select: "toString(reported_timestamp)",
      where: "reported_timestamp",
    },
    ingestedTimestamp: {
      select: "toString(ingested_timestamp)",
      where: "ingested_timestamp",
    },
    basicUsageType: { select: null, where: null },
    debitAmount: { select: null, where: null },
    model: { select: null, where: null },
    inputTokens: { select: null, where: null },
    outputTokens: { select: null, where: null },
    inputDebitAmount: { select: null, where: null },
    outputDebitAmount: { select: null, where: null },
    inputCacheTokens: { select: null, where: null },
    inputCacheDebitAmount: { select: null, where: null },
    creditAmount: { select: "toString(credit_amount)", where: "credit_amount" },
    provider: { select: null, where: null },
    metadata: { select: null, where: null },
  },
};

const CH_PARAM_TYPE: Record<string, string> = {
  eventId: "String",
  eventType: "String",
  reportedTimestamp: "DateTime64(3, 'UTC')",
  ingestedTimestamp: "DateTime64(3, 'UTC')",
  userId: "String",
  apiKeyId: "String",
  basicUsageType: "String",
  debitAmount: "Int64",
  model: "String",
  inputTokens: "Int64",
  outputTokens: "Int64",
  inputDebitAmount: "Int64",
  outputDebitAmount: "Int64",
  inputCacheTokens: "Int64",
  inputCacheDebitAmount: "Int64",
  creditAmount: "Int64",
  provider: "String",
  metadata: "String",
};

const OUTPUT_FIELDS: ChFieldKey[] = Object.keys(
  CH_FIELDS.basic_usage_events
) as ChFieldKey[];

function buildSelectColumns(table: EventTableName): string {
  const defs = CH_FIELDS[table];
  if (!defs) return "*";
  const parts: string[] = [];
  for (const alias of OUTPUT_FIELDS) {
    const def = defs[alias];
    if (def?.select) {
      parts.push(`${def.select} as ${alias}`);
    } else {
      parts.push(`NULL as ${alias}`);
    }
  }
  return parts.join(", ");
}

function buildWhereFromGroup(
  group: QueryFilterGroup,
  table: EventTableName,
  params: Record<string, unknown>,
  paramIndex: { value: number }
): string {
  const parts: string[] = [];

  for (const condition of group.conditions) {
    if (condition.field === "eventType") continue;
    const col = CH_FIELDS[table]?.[condition.field as ChFieldKey]?.where;
    if (!col) continue;
    const op = OPERATOR_SQL[condition.operator];
    if (!op) continue;

    const paramName = `p_${paramIndex.value++}`;
    const paramType = CH_PARAM_TYPE[condition.field] ?? "String";

    let value: string | number = condition.value;
    if (
      condition.field === "reportedTimestamp" ||
      condition.field === "ingestedTimestamp"
    ) {
      const dt = DateTime.fromISO(condition.value);
      if (dt.isValid) {
        value = toClickHouseDateTime(dt);
      }
    }

    params[paramName] = value;
    parts.push(`${col} ${op} {${paramName}:${paramType}}`);
  }

  for (const subGroup of group.groups) {
    const subClause = buildWhereFromGroup(subGroup, table, params, paramIndex);
    if (subClause) parts.push(`(${subClause})`);
  }

  if (parts.length === 0) return "";
  const joiner = group.logical === "OR" ? " OR " : " AND ";
  return parts.join(joiner);
}

export async function handleQueryEvents(
  request: QueryRequest
): Promise<QueryResponse> {
  const tables = getTablesForRequest(request.where);
  if (tables.length === 0) {
    return { rows: [], total: 0 };
  }

  try {
    if (request.aggregation) {
      return await handleAggregationQuery(request, tables);
    }
    return await handleListQuery(request, tables);
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
  request: QueryRequest,
  tables: EventTableName[]
): Promise<QueryResponse> {
  const client = getClickHouseDB();
  const paramIndex = { value: 0 };
  const params: Record<string, unknown> = {};

  const queries = tables.map((t) => {
    const whereClause = buildWhereFromGroup(
      request.where,
      t,
      params,
      paramIndex
    );
    let q = `SELECT ${buildSelectColumns(t)} FROM ${t}`;
    if (whereClause) q += ` WHERE ${whereClause}`;
    return q;
  });

  let unionQuery = queries.join(" UNION ALL ");
  unionQuery += " ORDER BY reportedTimestamp DESC";

  if (request.limit) {
    const limitParam = `p_${paramIndex.value++}`;
    unionQuery += ` LIMIT {${limitParam}:Int32}`;
    params[limitParam] = request.limit;
  }

  if (request.offset) {
    const offsetParam = `p_${paramIndex.value++}`;
    unionQuery += ` OFFSET {${offsetParam}:Int32}`;
    params[offsetParam] = request.offset;
  }

  const rs = await client.query({
    query: unionQuery,
    query_params: params,
    format: "JSONEachRow",
  });
  const data = await rs.json<Record<string, string>>();

  const rows: QueryResultRow[] = (
    data as unknown as Record<string, string>[]
  ).map(normalizeRow);

  const total = await getTotalCount(request, tables);

  return { rows, total };
}

async function handleAggregationQuery(
  request: QueryRequest,
  tables: EventTableName[]
): Promise<QueryResponse> {
  const client = getClickHouseDB();
  const agg = request.aggregation!;
  const isSum = agg.type === "SUM";
  const paramIndex = { value: 0 };
  const params: Record<string, unknown> = {};

  const subQueries = tables.map((t) => {
    const cols: string[] = [];

    if (request.groupBy) {
      const gbCol = CH_FIELDS[t]?.[request.groupBy as ChFieldKey]?.where;
      if (gbCol) {
        cols.push(`${gbCol} as group_value`);
      } else if (request.groupBy === "eventType") {
        cols.push(`'${TABLE_TO_EVENT_TYPE[t]}' as group_value`);
      } else {
        cols.push("NULL as group_value");
      }
    }

    if (isSum && agg.field) {
      const aggCol = CH_FIELDS[t]?.[agg.field as ChFieldKey]?.where;
      if (aggCol) {
        cols.push(`toInt64(${aggCol}) as agg_value`);
      } else {
        cols.push("toInt64(0) as agg_value");
      }
    } else {
      cols.push("toInt64(1) as agg_value");
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
      ? "SELECT group_value, toString(sum(agg_value)) as agg_value"
      : "SELECT toString(sum(agg_value)) as agg_value";
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
  request: QueryRequest,
  tables: EventTableName[]
): Promise<number> {
  const client = getClickHouseDB();
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
