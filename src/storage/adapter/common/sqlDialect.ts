import type {
  QueryRequest,
  QueryResponse,
  QueryFilterGroup,
} from "../../../interface/storage/Storage";
import type { EventTableName } from "../common/queryEventsBase";

/**
 * Tenant scope enforced on every event query. Rows outside the caller's
 * project are never visible; `mode` additionally restricts production/test
 * keys to their own partition (dashboard keys pass `null` to see both).
 */
export interface QueryScope {
  projectId: string;
  mode: "production" | "test" | null;
}

export interface QueryDialect {
  filterTables(tables: EventTableName[]): EventTableName[];

  executeListQuery(
    request: QueryRequest,
    tables: EventTableName[],
    scope: QueryScope
  ): Promise<QueryResponse>;

  executeAggregationQuery(
    request: QueryRequest,
    tables: EventTableName[],
    scope: QueryScope
  ): Promise<QueryResponse>;

  getTotalCount(
    request: QueryRequest,
    tables: EventTableName[],
    scope: QueryScope
  ): Promise<number>;
}
