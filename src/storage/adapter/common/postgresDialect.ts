import { sql, type SQL } from "drizzle-orm";
import { getPostgresDB } from "../../db/postgres/db";
import { StorageError } from "../../../errors/storage";
import {
  OPERATOR_SQL,
  TABLE_TO_EVENT_TYPE,
  type EventTableName,
} from "../common/queryEventsBase";
import { FIELD_REGISTRY, OUTPUT_FIELDS } from "../common/fieldRegistry";
import type {
  QueryRequest,
  QueryFilterGroup,
  QueryResponse,
  QueryResultRow,
} from "../../../interface/storage/Storage";
import type { QueryDialect, QueryScope } from "../common/sqlDialect";

export class PostgresQueryDialect implements QueryDialect {
  filterTables(tables: EventTableName[]): EventTableName[] {
    return tables;
  }

  async executeListQuery(
    request: QueryRequest,
    tables: EventTableName[],
    scope: QueryScope
  ): Promise<QueryResponse> {
    const db = getPostgresDB();

    const subqueries = tables.map((t) => {
      const selectExpr = this.buildSelectColumns(t);
      const whereExpr = this.buildScopedWhereClause(request.where, t, scope);
      return sql`SELECT ${selectExpr} FROM ${sql.raw(t)} WHERE ${whereExpr}`;
    });

    const unionQuery = sql.join(subqueries, sql` UNION ALL `);
    const orderByField = request.orderBy?.field ?? "reportedTimestamp";
    const orderByDir = request.orderBy?.descending ? "DESC" : "ASC";

    const finalQuery = sql`
      ${unionQuery}
      ORDER BY ${sql.raw(`"${orderByField}" ${orderByDir}`)}
      LIMIT ${request.limit ?? 100}
      OFFSET ${request.offset ?? 0}
    `;

    const result = await db.execute(finalQuery);
    const data = result as unknown as Record<string, unknown>[];
    const rows: QueryResultRow[] = data.map(normalizeRow);

    const total = await this.getTotalCount(request, tables, scope);

    return { rows, total };
  }

  async executeAggregationQuery(
    request: QueryRequest,
    tables: EventTableName[],
    scope: QueryScope
  ): Promise<QueryResponse> {
    const db = getPostgresDB();
    const agg = request.aggregation!;
    const isSum = agg.type === "SUM";

    if (isSum && agg.field && !OUTPUT_FIELDS.includes(agg.field)) {
      throw StorageError.invalidData(`Unknown aggregation field: ${agg.field}`);
    }

    const subqueries = tables.map((t) => {
      const cols: SQL[] = [];

      if (request.groupBy) {
        const gbField = FIELD_REGISTRY[t]?.[request.groupBy];
        if (gbField?.pgWhereCol) {
          cols.push(
            sql`${sql.raw(gbField.pgWhereCol)} as ${sql.raw(`"group_value"`)}`
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
        const def = FIELD_REGISTRY[t]?.[agg.field];
        if (def?.pgAggExpr) {
          cols.push(
            sql`${sql.raw(def.pgAggExpr)} as ${sql.raw(`"agg_value"`)}`
          );
        } else if (def?.pgWhereCol) {
          cols.push(
            sql`${sql.raw(def.pgWhereCol)}::bigint as ${sql.raw(`"agg_value"`)}`
          );
        } else {
          cols.push(sql`0::bigint as ${sql.raw(`"agg_value"`)}`);
        }
      } else {
        cols.push(sql`1::bigint as ${sql.raw(`"agg_value"`)}`);
      }

      const whereClause = this.buildScopedWhereClause(request.where, t, scope);
      return sql`SELECT ${sql.join(cols, sql`, `)} FROM ${sql.raw(t)} WHERE ${whereClause}`;
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

  async getTotalCount(
    request: QueryRequest,
    tables: EventTableName[],
    scope: QueryScope
  ): Promise<number> {
    const db = getPostgresDB();

    const subqueries = tables.map((t) => {
      const whereClause = this.buildScopedWhereClause(request.where, t, scope);
      return sql`SELECT count(*)::int as cnt FROM ${sql.raw(t)} WHERE ${whereClause}`;
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

  private buildSelectColumns(table: EventTableName): SQL {
    const defs = FIELD_REGISTRY[table];
    const cols: SQL[] = [];
    for (const alias of OUTPUT_FIELDS) {
      const def = defs?.[alias];
      const expr = def?.pgSelect;
      if (expr) {
        cols.push(sql`${sql.raw(expr)} as ${sql.raw(`"${alias}"`)}`);
      } else {
        cols.push(sql`NULL as ${sql.raw(`"${alias}"`)}`);
      }
    }
    return sql.join(cols, sql`, `);
  }

  private buildConditionParts(
    group: QueryFilterGroup,
    table: EventTableName
  ): SQL[] {
    const parts: SQL[] = [];

    for (const cond of group.conditions) {
      if (cond.field === "eventType") {
        const tableEventType = TABLE_TO_EVENT_TYPE[table];
        let isTrue = false;
        if (cond.operator === "EQ") isTrue = cond.value === tableEventType;
        else if (cond.operator === "NEQ")
          isTrue = cond.value !== tableEventType;
        else isTrue = true;
        parts.push(isTrue ? sql`1=1` : sql`1=0`);
        continue;
      }
      const def = FIELD_REGISTRY[table]?.[cond.field];

      const colExpr =
        def?.pgWhereCol || def?.pgAggExpr || def?.pgSelect || "NULL";
      const op = OPERATOR_SQL[cond.operator];
      if (!op) continue;

      parts.push(
        sql`${sql.raw(colExpr)} ${sql.raw(op)} ${cond.value}${sql.raw(def?.pgWhereCast || "")}`
      );
    }

    for (const sub of group.groups) {
      const subParts = this.buildConditionParts(sub, table);
      if (subParts.length > 0) {
        parts.push(
          sql`(${sql.join(subParts, sql` ${sql.raw(sub.logical)} `)})`
        );
      }
    }

    return parts;
  }

  /**
   * Combines the caller's filters with the mandatory tenant scope so that a
   * query can never read rows from another project (or, for production/test
   * keys, from the other mode).
   */
  private buildScopedWhereClause(
    group: QueryFilterGroup,
    table: EventTableName,
    scope: QueryScope
  ): SQL {
    const parts: SQL[] = [sql`project_id = ${scope.projectId}::uuid`];
    if (scope.mode) {
      parts.push(sql`mode = ${scope.mode}`);
    }
    const userWhere = this.buildWhereClause(group, table);
    if (userWhere) {
      parts.push(sql`(${userWhere})`);
    }
    return sql.join(parts, sql` AND `);
  }

  private buildWhereClause(
    group: QueryFilterGroup,
    table: EventTableName
  ): SQL | undefined {
    const parts = this.buildConditionParts(group, table);
    if (parts.length === 0) return undefined;
    return sql.join(parts, sql` ${sql.raw(group.logical)} `);
  }
}

function normalizeRow(row: Record<string, unknown>): QueryResultRow {
  const result: QueryResultRow = {};
  for (const [key, value] of Object.entries(row)) {
    result[key] = value ?? null;
  }
  return result;
}
