import { STORAGE_ADAPTER } from "../../../config/identifiers";
import { StorageError } from "../../../errors/storage";
import { getTablesForRequest } from "./queryEventsBase";
import { PostgresQueryDialect } from "./postgresDialect";
import { ClickHouseQueryDialect } from "./clickHouseDialect";
import type { QueryScope } from "./sqlDialect";
import type {
  QueryRequest,
  QueryResponse,
} from "../../../interface/storage/Storage";
import type { AuthContext } from "../../../context/auth";

export async function handleQueryEvents(
  request: QueryRequest,
  auth: AuthContext
): Promise<QueryResponse> {
  const tables = getTablesForRequest(request.where);

  const dialect =
    STORAGE_ADAPTER === "clickhouse"
      ? new ClickHouseQueryDialect()
      : new PostgresQueryDialect();

  const filtered = dialect.filterTables(tables);
  if (filtered.length === 0) {
    return { rows: [], total: 0 };
  }

  const scope: QueryScope = { projectId: auth.projectId, mode: auth.mode };

  try {
    if (request.aggregation) {
      return await dialect.executeAggregationQuery(request, filtered, scope);
    }
    return await dialect.executeListQuery(request, filtered, scope);
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
      `Failed to query ${STORAGE_ADAPTER === "clickhouse" ? "ClickHouse" : "Postgres"} events`,
      e instanceof Error ? e : new Error(String(e))
    );
  }
}
