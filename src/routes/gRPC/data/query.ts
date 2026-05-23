import type { sendUnaryData } from "@grpc/grpc-js";
import { QueryRequest, QueryResponse, Row } from "../../../gen/data/v1/data";
import { dataQuerySchema, type DataQueryRequest } from "../../../zod/data";
import { EventError } from "../../../errors/event";
import { formatZodError } from "../../../utils/formatZodError";
import { getPostgresDB } from "../../../storage/db/postgres/db";
import {
  usersTable,
  sessionsTable,
  tagsTable,
  expressionsTable,
  metadataTable,
} from "../../../storage/db/postgres/schema";
import {
  eq,
  gt,
  gte,
  lt,
  lte,
  ne,
  like,
  and,
  or,
  asc,
  desc,
  count,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { WideEventBuilder } from "../../../context/requestContext";
import { wideEventContextKey } from "../../../context/requestContext";
import type { ContextUnaryCall } from "../../../interface/types/context.js";

interface FieldDef {
  col: AnyPgColumn;
  cast: "text" | "integer" | "uuid" | "timestamptz" | "boolean";
}

interface TableDef {
  tableName: string;
  table:
    | typeof usersTable
    | typeof sessionsTable
    | typeof tagsTable
    | typeof expressionsTable
    | typeof metadataTable;
  fields: Record<string, FieldDef>;
}

const TABLE_REGISTRY: Record<string, TableDef> = {
  users: {
    tableName: "users",
    table: usersTable,
    fields: {
      id: { col: usersTable.id, cast: "uuid" },
      lastBilledTimestamp: {
        col: usersTable.last_billed_timestamp,
        cast: "timestamptz",
      },
      paymentProviderUserId: {
        col: usersTable.payment_provider_user_id,
        cast: "text",
      },
      mode: { col: usersTable.mode, cast: "text" },
    },
  },
  sessions: {
    tableName: "sessions",
    table: sessionsTable,
    fields: {
      proxy_link_id: { col: sessionsTable.proxy_link_id, cast: "uuid" },
      sessionId: { col: sessionsTable.sessionId, cast: "text" },
      processed: { col: sessionsTable.processed, cast: "boolean" },
      userId: { col: sessionsTable.userId, cast: "uuid" },
      billedUpto: { col: sessionsTable.billed_upto, cast: "timestamptz" },
      createdAt: { col: sessionsTable.createdAt, cast: "timestamptz" },
      mode: { col: sessionsTable.mode, cast: "text" },
    },
  },
  tags: {
    tableName: "tags",
    table: tagsTable,
    fields: {
      id: { col: tagsTable.id, cast: "uuid" },
      key: { col: tagsTable.key, cast: "text" },
      amount: { col: tagsTable.amount, cast: "integer" },
    },
  },
  expressions: {
    tableName: "expressions",
    table: expressionsTable,
    fields: {
      id: { col: expressionsTable.id, cast: "uuid" },
      key: { col: expressionsTable.key, cast: "text" },
      expr: { col: expressionsTable.expr, cast: "text" },
    },
  },
  metadata: {
    tableName: "metadata",
    table: metadataTable,
    fields: {
      id: { col: metadataTable.id, cast: "uuid" },
      paymentCron: { col: metadataTable.payment_cron, cast: "text" },
      paymentWebhook: { col: metadataTable.payment_webhook, cast: "text" },
    },
  },
};

function castValue(
  value: string,
  fieldDef: FieldDef,
  fieldName: string
): boolean | number | string {
  if (fieldDef.cast === "boolean") {
    if (value !== "true" && value !== "false") {
      throw EventError.validationFailed(
        `Invalid boolean value '${value}' for field '${fieldName}': must be "true" or "false"`
      );
    }
    return value === "true";
  }
  if (fieldDef.cast === "integer") {
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      throw EventError.validationFailed(
        `Invalid integer value '${value}' for field '${fieldName}': must be a finite integer`
      );
    }
    return n;
  }
  return value;
}

function applyOp(
  col: AnyPgColumn,
  op: string,
  value: string,
  fieldDef: FieldDef,
  fieldName: string
): SQL {
  const casted = castValue(value, fieldDef, fieldName);
  switch (op) {
    case "EQ":
      return eq(col, casted);
    case "GT":
      return gt(col, casted);
    case "GTE":
      return gte(col, casted);
    case "LT":
      return lt(col, casted);
    case "LTE":
      return lte(col, casted);
    case "NEQ":
      return ne(col, casted);
    case "CONTAINS":
      return like(col, `%${value}%`);
    default:
      return eq(col, casted);
  }
}

function buildWhere(
  group: DataQueryRequest["where"],
  tableDef: TableDef
): SQL | undefined {
  const parts: SQL[] = [];

  for (const condition of group.conditions) {
    const fieldDef = tableDef.fields[condition.field];
    if (!fieldDef) {
      throw EventError.validationFailed(
        `Unknown field '${condition.field}' in table '${tableDef.tableName}'`
      );
    }
    const clause = applyOp(
      fieldDef.col,
      condition.operator,
      condition.value,
      fieldDef,
      condition.field
    );
    parts.push(clause);
  }

  for (const subGroup of group.groups) {
    const subWhere = buildWhere(subGroup, tableDef);
    if (subWhere) parts.push(subWhere);
  }

  if (parts.length === 0) return undefined;
  return group.logical === "OR" ? or(...parts) : and(...parts);
}

function buildSelect(tableDef: TableDef): Record<string, AnyPgColumn> {
  const result: Record<string, AnyPgColumn> = {};
  for (const [name, def] of Object.entries(tableDef.fields)) {
    result[name] = def.col;
  }
  return result;
}

export async function queryData(
  call: ContextUnaryCall<QueryRequest, QueryResponse>,
  callback?: sendUnaryData<QueryResponse>
): Promise<void> {
  const wideEventBuilder = call[wideEventContextKey] as
    | WideEventBuilder
    | undefined;

  try {
    const req = { ...call.request } as Record<string, unknown>;

    const validated = dataQuerySchema.parse(req);

    wideEventBuilder?.addContext({
      table: validated.table,
      operation: "query",
    });

    const tableDef = TABLE_REGISTRY[validated.table];
    if (!tableDef) {
      return callback?.(
        EventError.validationFailed(`Unknown table: ${validated.table}`)
      );
    }

    const db = getPostgresDB();
    const whereClause = buildWhere(validated.where, tableDef);
    const selectCols = buildSelect(tableDef);
    const columns = Object.keys(tableDef.fields);

    const orderClauses = validated.orderBy.map((o) => {
      const fieldDef = tableDef.fields[o.field];
      if (!fieldDef) {
        throw EventError.validationFailed(
          `Unknown field '${o.field}' for table '${validated.table}' in order_by`
        );
      }
      return o.descending ? desc(fieldDef.col) : asc(fieldDef.col);
    });

    const [countResult, rows] = await Promise.all([
      db
        .select({ cnt: count() })
        .from(tableDef.table)
        .where(whereClause)
        .execute(),
      db
        .select(selectCols)
        .from(tableDef.table)
        .where(whereClause)
        .orderBy(...orderClauses)
        .limit(validated.limit)
        .offset(validated.offset)
        .execute(),
    ]);

    const total = Number(countResult[0]?.cnt ?? 0);

    const response = QueryResponse.create();
    response.columns = columns;
    response.rows = rows.map((row) => {
      const r = Row.create();
      r.values = columns.map((c) => String(row[c] ?? ""));
      return r;
    });
    response.total = total;

    callback?.(null, response);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      (error as Error).name === "ZodError"
    ) {
      const formatted = formatZodError(error, (msg) =>
        EventError.validationFailed(msg)
      );
      return callback?.(formatted as Error);
    }
    callback?.(error as Error);
  }
}
