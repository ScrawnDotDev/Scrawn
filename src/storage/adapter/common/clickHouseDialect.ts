import { getClickHouseDB } from "../../db/clickhouse";
import { StorageError } from "../../../errors/storage";
import { DateTime } from "luxon";
import { toClickHouseDateTime } from "../clickhouse/utils";
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

const CH_TABLES: EventTableName[] = [
  "basic_usage_events",
  "ai_token_usage_events",
];

export class ClickHouseQueryDialect implements QueryDialect {
  filterTables(tables: EventTableName[]): EventTableName[] {
    return tables.filter((t) => CH_TABLES.includes(t));
  }

  async executeListQuery(
    request: QueryRequest,
    tables: EventTableName[],
    scope: QueryScope
  ): Promise<QueryResponse> {
    const client = getClickHouseDB();
    const paramIndex = { value: 0 };
    const params: Record<string, unknown> = {};

    const queries = tables.map((t) => {
      const whereClause = this.buildScopedWhereClause(
        request.where,
        t,
        scope,
        params,
        paramIndex
      );
      return `SELECT ${this.buildSelectColumns(t)} FROM ${t} FINAL WHERE ${whereClause}`;
    });

    const unionQuery = queries.join(" UNION ALL ");
    let finalQuery = `SELECT * FROM (${unionQuery})`;

    const orderByField = request.orderBy?.field ?? "reportedTimestamp";
    const orderByDir = request.orderBy?.descending ? "DESC" : "ASC";

    finalQuery += ` ORDER BY ${orderByField} ${orderByDir}`;

    if (request.limit !== undefined) {
      const limitParam = `p_${paramIndex.value++}`;
      finalQuery += ` LIMIT {${limitParam}:Int32}`;
      params[limitParam] = request.limit;
    }

    if (request.offset !== undefined) {
      const offsetParam = `p_${paramIndex.value++}`;
      finalQuery += ` OFFSET {${offsetParam}:Int32}`;
      params[offsetParam] = request.offset;
    }

    const rs = await client.query({
      query: finalQuery,
      query_params: params,
      format: "JSONEachRow",
    });
    const data = await rs.json<Record<string, string>>();

    const rows: QueryResultRow[] = (
      data as unknown as Record<string, string>[]
    ).map(normalizeRow);

    const total = await this.getTotalCount(request, tables, scope);

    return { rows, total };
  }

  async executeAggregationQuery(
    request: QueryRequest,
    tables: EventTableName[],
    scope: QueryScope
  ): Promise<QueryResponse> {
    const client = getClickHouseDB();
    const agg = request.aggregation!;
    const isSum = agg.type === "SUM";

    if (isSum && agg.field && !OUTPUT_FIELDS.includes(agg.field)) {
      throw StorageError.invalidData(`Unknown aggregation field: ${agg.field}`);
    }
    const paramIndex = { value: 0 };
    const params: Record<string, unknown> = {};

    const subQueries = tables.map((t) => {
      const cols: string[] = [];

      if (request.groupBy) {
        const gbDef = FIELD_REGISTRY[t]?.[request.groupBy];
        if (gbDef?.chWhere) {
          cols.push(`${gbDef.chWhere} as group_value`);
        } else if (request.groupBy === "eventType") {
          cols.push(`'${TABLE_TO_EVENT_TYPE[t]}' as group_value`);
        } else {
          cols.push("NULL as group_value");
        }
      }

      if (isSum && agg.field) {
        const def = FIELD_REGISTRY[t]?.[agg.field];
        if (def?.chAggExpr) {
          cols.push(`toInt64(${def.chAggExpr}) as agg_value`);
        } else if (def?.chWhere) {
          cols.push(`toInt64(${def.chWhere}) as agg_value`);
        } else {
          cols.push("toInt64(0) as agg_value");
        }
      } else {
        cols.push("toInt64(1) as agg_value");
      }

      const whereClause = this.buildScopedWhereClause(
        request.where,
        t,
        scope,
        params,
        paramIndex
      );
      return `SELECT ${cols.join(", ")} FROM ${t} FINAL WHERE ${whereClause}`;
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

  async getTotalCount(
    request: QueryRequest,
    tables: EventTableName[],
    scope: QueryScope
  ): Promise<number> {
    const client = getClickHouseDB();
    const paramIndex = { value: 0 };
    const params: Record<string, unknown> = {};

    const subQueries = tables.map((t) => {
      const whereClause = this.buildScopedWhereClause(
        request.where,
        t,
        scope,
        params,
        paramIndex
      );
      return `SELECT count() as cnt FROM ${t} FINAL WHERE ${whereClause}`;
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

  private buildSelectColumns(table: EventTableName): string {
    const defs = FIELD_REGISTRY[table];
    if (!defs) return "*";
    const parts: string[] = [];
    for (const alias of OUTPUT_FIELDS) {
      const def = defs[alias];
      if (def?.chSelect) {
        parts.push(`${def.chSelect} as ${alias}`);
      } else {
        parts.push(`NULL as ${alias}`);
      }
    }
    return parts.join(", ");
  }

  /**
   * Combines the caller's filters with the mandatory tenant scope so that a
   * query can never read rows from another project (or, for production/test
   * keys, from the other mode).
   */
  private buildScopedWhereClause(
    group: QueryFilterGroup,
    table: EventTableName,
    scope: QueryScope,
    params: Record<string, unknown>,
    paramIndex: { value: number }
  ): string {
    const projectParam = `p_${paramIndex.value++}`;
    params[projectParam] = scope.projectId;
    const parts: string[] = [`project_id = {${projectParam}:String}`];

    if (scope.mode) {
      const modeParam = `p_${paramIndex.value++}`;
      params[modeParam] = scope.mode;
      parts.push(`mode = {${modeParam}:String}`);
    }

    const userWhere = this.buildWhereClause(group, table, params, paramIndex);
    if (userWhere) {
      parts.push(`(${userWhere})`);
    }
    return parts.join(" AND ");
  }

  private buildWhereClause(
    group: QueryFilterGroup,
    table: EventTableName,
    params: Record<string, unknown>,
    paramIndex: { value: number }
  ): string {
    const parts: string[] = [];

    for (const condition of group.conditions) {
      if (condition.field === "eventType") {
        const tableEventType = TABLE_TO_EVENT_TYPE[table];
        let isTrue = false;
        if (condition.operator === "EQ")
          isTrue = condition.value === tableEventType;
        else if (condition.operator === "NEQ")
          isTrue = condition.value !== tableEventType;
        else isTrue = true;
        parts.push(isTrue ? "1=1" : "1=0");
        continue;
      }
      const def = FIELD_REGISTRY[table]?.[condition.field];

      const colExpr = def?.chWhere || def?.chAggExpr || def?.chSelect || "NULL";
      const op = OPERATOR_SQL[condition.operator];
      if (!op) continue;

      const paramName = `p_${paramIndex.value++}`;
      const paramType = def?.chParamType || "String";

      let value: string | number = condition.value;
      if (
        condition.field === "reportedTimestamp" ||
        condition.field === "ingestedTimestamp"
      ) {
        const dt = DateTime.fromISO(condition.value, { zone: "utc" });
        if (dt.isValid) {
          value = toClickHouseDateTime(dt);
        }
      }

      params[paramName] = value;
      parts.push(`${colExpr} ${op} {${paramName}:${paramType}}`);
    }

    for (const subGroup of group.groups) {
      const subClause = this.buildWhereClause(
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
