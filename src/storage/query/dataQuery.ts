import type { SQL } from "drizzle-orm";
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
import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";
import { getPostgresDB } from "../db/postgres/db";
import {
  usersTable,
  sessionsTable,
  tagsTable,
  expressionsTable,
  metadataTable,
} from "../db/postgres/schema";
import type { DataQueryRequest } from "../../zod/data";
import { EventError } from "../../errors/event";
import type { AuthContext } from "../../context/auth";

interface FieldDef {
  col: AnyPgColumn;
  cast: "text" | "integer" | "uuid" | "timestamptz" | "boolean";
}

interface TableDef {
  tableName: string;
  table: AnyPgTable;
  fields: Record<string, FieldDef>;
}

function getCastForColumn(col: AnyPgColumn): FieldDef["cast"] {
  const type = col.columnType;
  switch (type) {
    case "PgBigInt":
    case "PgInteger":
      return "integer";
    case "PgBoolean":
      return "boolean";
    case "PgUUID":
      return "uuid";
    case "PgTimestamp":
      return "timestamptz";
    default:
      return "text";
  }
}

function fieldDef(col: AnyPgColumn): FieldDef {
  return { col, cast: getCastForColumn(col) };
}

const TABLE_REGISTRY: Record<string, TableDef> = {
  users: {
    tableName: "users",
    table: usersTable,
    fields: {
      projectId: fieldDef(usersTable.projectId),
      id: fieldDef(usersTable.id),
      lastBilledTimestamp: fieldDef(usersTable.last_billed_timestamp),
      paymentProviderUserId: fieldDef(usersTable.payment_provider_user_id),
      mode: fieldDef(usersTable.mode),
    },
  },
  sessions: {
    tableName: "sessions",
    table: sessionsTable,
    fields: {
      projectId: fieldDef(sessionsTable.projectId),
      proxy_link_id: fieldDef(sessionsTable.proxy_link_id),
      sessionId: fieldDef(sessionsTable.sessionId),
      processed: fieldDef(sessionsTable.processed),
      userId: fieldDef(sessionsTable.userId),
      billedUpto: fieldDef(sessionsTable.billed_upto),
      createdAt: fieldDef(sessionsTable.createdAt),
      mode: fieldDef(sessionsTable.mode),
    },
  },
  tags: {
    tableName: "tags",
    table: tagsTable,
    fields: {
      projectId: fieldDef(tagsTable.projectId),
      id: fieldDef(tagsTable.id),
      key: fieldDef(tagsTable.key),
      amount: fieldDef(tagsTable.amount),
    },
  },
  expressions: {
    tableName: "expressions",
    table: expressionsTable,
    fields: {
      projectId: fieldDef(expressionsTable.projectId),
      id: fieldDef(expressionsTable.id),
      key: fieldDef(expressionsTable.key),
      expr: fieldDef(expressionsTable.expr),
    },
  },
  metadata: {
    tableName: "metadata",
    table: metadataTable,
    fields: {
      projectId: fieldDef(metadataTable.projectId),
      id: fieldDef(metadataTable.id),
    },
  },
};

export const DATA_TABLE_NAMES = Object.keys(TABLE_REGISTRY) as [
  string,
  ...string[],
];

function castValue(
  value: string | number | boolean,
  fieldDef: FieldDef,
  fieldName: string
): boolean | number | string {
  if (fieldDef.cast === "boolean") {
    if (typeof value === "boolean") return value;
    if (value !== "true" && value !== "false") {
      throw EventError.validationFailed(
        `Invalid boolean value '${value}' for field '${fieldName}': must be "true" or "false"`
      );
    }
    return value === "true";
  }
  if (fieldDef.cast === "integer") {
    if (typeof value === "number") {
      if (!Number.isFinite(value) || !Number.isInteger(value)) {
        throw EventError.validationFailed(
          `Invalid integer value '${value}' for field '${fieldName}': must be a finite integer`
        );
      }
      return value;
    }
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      throw EventError.validationFailed(
        `Invalid integer value '${value}' for field '${fieldName}': must be a finite integer`
      );
    }
    return n;
  }
  return String(value);
}

function applyOp(
  col: AnyPgColumn,
  op: string,
  value: string | number | boolean,
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

export interface DataQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  hasMore: boolean;
}

export function getDataTable(table: string): TableDef | undefined {
  return TABLE_REGISTRY[table];
}

export async function executeDataQuery(
  auth: AuthContext,
  config: DataQueryRequest,
  tableDef: TableDef
): Promise<DataQueryResult> {
  const db = getPostgresDB();
  const userWhere = buildWhere(config.where, tableDef);

  const authConditions: SQL[] = [];
  if (tableDef.fields.projectId) {
    authConditions.push(eq(tableDef.fields.projectId.col, auth.projectId));
  }
  // A null mode (dashboard keys) means "all modes"; filtering on it would
  // produce `mode = NULL`, which never matches.
  if (tableDef.fields.mode && auth.mode) {
    authConditions.push(eq(tableDef.fields.mode.col, auth.mode));
  }
  const finalWhere = and(userWhere, ...authConditions);

  const selectCols = buildSelect(tableDef);
  const columns = Object.keys(tableDef.fields);

  const orderClauses = config.orderBy.map((o) => {
    const fieldDef = tableDef.fields[o.field];
    if (!fieldDef) {
      throw EventError.validationFailed(
        `Unknown field '${o.field}' for table '${tableDef.tableName}' in order_by`
      );
    }
    return o.descending ? desc(fieldDef.col) : asc(fieldDef.col);
  });

  const fetchLimit = config.limit + 1;

  const [countResult, rows] = await Promise.all([
    db
      .select({ cnt: count() })
      .from(tableDef.table)
      .where(finalWhere)
      .execute(),
    db
      .select(selectCols)
      .from(tableDef.table)
      .where(finalWhere)
      .orderBy(...orderClauses)
      .limit(fetchLimit)
      .offset(config.offset)
      .execute(),
  ]);

  const total = Number(countResult[0]?.cnt ?? 0);
  const hasMore = rows.length > config.limit;
  if (hasMore) {
    rows.pop();
  }

  const result: Record<string, unknown>[] = rows.map((row) => {
    const r: Record<string, unknown> = {};
    for (const c of columns) {
      r[c] = row[c] ?? "";
    }
    return r;
  });

  return { columns, rows: result, total, hasMore };
}
