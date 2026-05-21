import { sql, type SQL } from "drizzle-orm";
import { getPostgresDB } from "../../../db/postgres/db";
import { StorageError } from "../../../../errors/storage";
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
} from "../../../../interface/storage/Storage";
import type { AuthContext } from "../../../../context/auth";

interface PGFieldDef {
  select: string | null;
  whereCol: string | null;
  whereCast: string;
  aggExpr?: string;
}

type PGFieldRegistry = Record<EventTableName, Record<string, PGFieldDef>>;

const PG_FIELDS: PGFieldRegistry = {
  basic_usage_events: {
    eventId: { select: "event_id::text", whereCol: "event_id", whereCast: "::uuid" },
    idempotencyKey: { select: "idempotency_key", whereCol: "idempotency_key", whereCast: "" },
    eventType: { select: "'BASIC_USAGE'", whereCol: null, whereCast: "" },
    userId: { select: "user_id::text", whereCol: "user_id", whereCast: "" },
    apiKeyId: {
      select: "api_key_id::text",
      whereCol: "api_key_id",
      whereCast: "",
    },
    reportedTimestamp: {
      select: "reported_timestamp::text",
      whereCol: "reported_timestamp",
      whereCast: "::timestamptz",
    },
    ingestedTimestamp: {
      select: "ingested_timestamp::text",
      whereCol: "ingested_timestamp",
      whereCast: "::timestamptz",
    },
    basicUsageType: { select: "type", whereCol: "type", whereCast: "" },
    debitAmount: {
      select: "debit_amount::text",
      whereCol: "debit_amount",
      whereCast: "::bigint",
    },
    model: { select: null, whereCol: null, whereCast: "" },
    inputTokens: { select: null, whereCol: null, whereCast: "" },
    outputTokens: { select: null, whereCol: null, whereCast: "" },
    inputDebitAmount: { select: null, whereCol: null, whereCast: "" },
    outputDebitAmount: { select: null, whereCol: null, whereCast: "" },
    inputCacheTokens: { select: null, whereCol: null, whereCast: "" },
    inputCacheDebitAmount: { select: null, whereCol: null, whereCast: "" },
    creditAmount: { select: null, whereCol: null, whereCast: "" },
    provider: { select: null, whereCol: null, whereCast: "" },
    metadata: { select: "metadata::text", whereCol: null, whereCast: "" },
  },
  ai_token_usage_events: {
    eventId: { select: "event_id::text", whereCol: "event_id", whereCast: "::uuid" },
    idempotencyKey: { select: "idempotency_key", whereCol: "idempotency_key", whereCast: "" },
    eventType: { select: "'AI_TOKEN_USAGE'", whereCol: null, whereCast: "" },
    userId: { select: "user_id::text", whereCol: "user_id", whereCast: "" },
    apiKeyId: {
      select: "api_key_id::text",
      whereCol: "api_key_id",
      whereCast: "",
    },
    reportedTimestamp: {
      select: "reported_timestamp::text",
      whereCol: "reported_timestamp",
      whereCast: "::timestamptz",
    },
    ingestedTimestamp: {
      select: "ingested_timestamp::text",
      whereCol: "ingested_timestamp",
      whereCast: "::timestamptz",
    },
    basicUsageType: { select: null, whereCol: null, whereCast: "" },
    debitAmount: {
      select:
        "(COALESCE((metrics->'debit_amount'->>'input')::integer,0) + COALESCE((metrics->'debit_amount'->>'input_cache')::integer,0) + COALESCE((metrics->'debit_amount'->>'output')::integer,0))::text",
      whereCol: null,
      whereCast: "",
      aggExpr:
        "(COALESCE((metrics->'debit_amount'->>'input')::bigint,0) + COALESCE((metrics->'debit_amount'->>'input_cache')::bigint,0) + COALESCE((metrics->'debit_amount'->>'output')::bigint,0))",
    },
    model: { select: "model", whereCol: "model", whereCast: "" },
    inputTokens: {
      select: "(metrics->'tokens'->>'input')::text",
      whereCol: null,
      whereCast: "",
      aggExpr: "(metrics->'tokens'->>'input')::bigint",
    },
    outputTokens: {
      select: "(metrics->'tokens'->>'output')::text",
      whereCol: null,
      whereCast: "",
      aggExpr: "(metrics->'tokens'->>'output')::bigint",
    },
    inputDebitAmount: {
      select: "(metrics->'debit_amount'->>'input')::text",
      whereCol: null,
      whereCast: "",
      aggExpr: "(metrics->'debit_amount'->>'input')::bigint",
    },
    outputDebitAmount: {
      select: "(metrics->'debit_amount'->>'output')::text",
      whereCol: null,
      whereCast: "",
      aggExpr: "(metrics->'debit_amount'->>'output')::bigint",
    },
    inputCacheTokens: {
      select: "(metrics->'tokens'->>'input_cache')::text",
      whereCol: null,
      whereCast: "",
      aggExpr: "(metrics->'tokens'->>'input_cache')::bigint",
    },
    inputCacheDebitAmount: {
      select: "(metrics->'debit_amount'->>'input_cache')::text",
      whereCol: null,
      whereCast: "",
      aggExpr: "(metrics->'debit_amount'->>'input_cache')::bigint",
    },
    creditAmount: { select: null, whereCol: null, whereCast: "" },
    provider: { select: "provider", whereCol: "provider", whereCast: "" },
    metadata: { select: "metadata::text", whereCol: null, whereCast: "" },
  },
};

const OUTPUT_FIELDS = Object.keys(PG_FIELDS.basic_usage_events);

function buildConditionParts(
  group: QueryFilterGroup,
  table: EventTableName
): SQL[] {
  const parts: SQL[] = [];

  for (const cond of group.conditions) {
    if (cond.field === "eventType") continue;
    const def = PG_FIELDS[table]?.[cond.field];
    if (!def?.whereCol) continue;
    const op = OPERATOR_SQL[cond.operator];
    if (!op) continue;
    parts.push(
      sql`${sql.raw(def.whereCol)} ${sql.raw(op)} ${cond.value}${sql.raw(def.whereCast)}`
    );
  }

  for (const sub of group.groups) {
    const subParts = buildConditionParts(sub, table);
    if (subParts.length > 0) {
      parts.push(sql`(${sql.join(subParts, sql` ${sql.raw(sub.logical)} `)})`);
    }
  }

  return parts;
}

function buildWhereClause(
  group: QueryFilterGroup,
  table: EventTableName
): SQL | undefined {
  const parts = buildConditionParts(group, table);
  if (parts.length === 0) return undefined;
  return sql.join(parts, sql` ${sql.raw(group.logical)} `);
}

function buildSelectColumns(table: EventTableName): SQL {
  const cols: SQL[] = [];
  for (const alias of OUTPUT_FIELDS) {
    const def = PG_FIELDS[table]?.[alias];
    const expr = def?.select;
    if (expr) {
      cols.push(sql`${sql.raw(expr)} as ${sql.raw(`"${alias}"`)}`);
    } else {
      cols.push(sql`NULL as ${sql.raw(`"${alias}"`)}`);
    }
  }
  return sql.join(cols, sql`, `);
}

export async function handleQueryEvents(
  request: QueryRequest,
  auth: AuthContext
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
      "Failed to query Postgres events",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

async function handleListQuery(
  request: QueryRequest,
  tables: EventTableName[]
): Promise<QueryResponse> {
  const db = getPostgresDB();

  const selectExpr = tables.map((t) => buildSelectColumns(t));
  const whereExpr = tables.map((t) => buildWhereClause(request.where, t));

  const subqueries = tables.map((t, i) => {
    const base = sql`SELECT ${selectExpr[i]} FROM ${sql.raw(t)}`;
    return whereExpr[i] ? sql`${base} WHERE ${whereExpr[i]}` : base;
  });

  const unionQuery = sql.join(subqueries, sql` UNION ALL `);

  const finalQuery = sql`
    ${unionQuery}
    ORDER BY "reportedTimestamp" DESC
    LIMIT ${request.limit ?? 100}
    OFFSET ${request.offset ?? 0}
  `;

  const result = await db.execute(finalQuery);
  const data = result as unknown as Record<string, unknown>[];
  const rows: QueryResultRow[] = data.map(normalizeRow);

  const total = await getTotalCount(request, tables);

  return { rows, total };
}

async function handleAggregationQuery(
  request: QueryRequest,
  tables: EventTableName[]
): Promise<QueryResponse> {
  const db = getPostgresDB();
  const agg = request.aggregation!;
  const isSum = agg.type === "SUM";

  const subqueries = tables.map((t) => {
    const cols: SQL[] = [];

    if (request.groupBy) {
      const gbField = PG_FIELDS[t]?.[request.groupBy];
      if (gbField?.whereCol) {
        cols.push(
          sql`${sql.raw(gbField.whereCol)} as ${sql.raw(`"group_value"`)}`
        );
      } else if (request.groupBy === "eventType") {
        cols.push(
          sql`${sql.raw(`'${TABLE_TO_EVENT_TYPE[t]}'`)} as ${sql.raw(`"group_value"`)}`
        );
      } else {
        cols.push(sql`NULL as ${sql.raw(`"group_value"`)}`);
      }
    }

    if (isSum && agg.field) {
      const def = PG_FIELDS[t]?.[agg.field];
      if (def?.aggExpr) {
        cols.push(sql`${sql.raw(def.aggExpr)} as ${sql.raw(`"agg_value"`)}`);
      } else if (def?.whereCol) {
        cols.push(
          sql`${sql.raw(def.whereCol)}::bigint as ${sql.raw(`"agg_value"`)}`
        );
      } else {
        cols.push(sql`0::bigint as ${sql.raw(`"agg_value"`)}`);
      }
    } else {
      cols.push(sql`1::bigint as ${sql.raw(`"agg_value"`)}`);
    }

    const whereClause = buildWhereClause(request.where, t);
    const base = sql`SELECT ${sql.join(cols, sql`, `)} FROM ${sql.raw(t)}`;
    return whereClause ? sql`${base} WHERE ${whereClause}` : base;
  });

  const unionQuery = sql.join(subqueries, sql` UNION ALL `);

  let outerQuery: SQL;
  if (request.groupBy) {
    if (isSum) {
      outerQuery = sql`
        SELECT "group_value", SUM("agg_value")::text as "agg_value"
        FROM (${unionQuery}) sub
        GROUP BY "group_value"
      `;
    } else {
      outerQuery = sql`
        SELECT "group_value", COUNT(*)::text as "agg_value"
        FROM (${unionQuery}) sub
        GROUP BY "group_value"
      `;
    }
  } else {
    if (isSum) {
      outerQuery = sql`
        SELECT SUM("agg_value")::text as "agg_value"
        FROM (${unionQuery}) sub
      `;
    } else {
      outerQuery = sql`
        SELECT COUNT(*)::text as "agg_value"
        FROM (${unionQuery}) sub
      `;
    }
  }

  const result = await db.execute(outerQuery);
  const data = result as unknown as Record<string, unknown>[];
  const rows: QueryResultRow[] = data.map((r) => ({
    group_value: r.group_value ?? null,
    agg_value: r.agg_value ?? "0",
  }));

  return { rows, total: rows.length };
}

async function getTotalCount(
  request: QueryRequest,
  tables: EventTableName[]
): Promise<number> {
  const db = getPostgresDB();

  const subqueries = tables.map((t) => {
    const whereClause = buildWhereClause(request.where, t);
    const base = sql`SELECT count(*)::int as cnt FROM ${sql.raw(t)}`;
    return whereClause ? sql`${base} WHERE ${whereClause}` : base;
  });

  const countQuery = sql`
    SELECT coalesce(sum(cnt), 0)::int as total
    FROM (${sql.join(subqueries, sql` UNION ALL `)}) sub
  `;

  const result = await db.execute(countQuery);
  const data = result as unknown as Record<string, unknown>[];
  const total = Number(data[0]?.total ?? 0);
  return total;
}

function normalizeRow(row: Record<string, unknown>): QueryResultRow {
  const result: QueryResultRow = {};
  for (const [key, value] of Object.entries(row)) {
    result[key] = value ?? null;
  }
  return result;
}
