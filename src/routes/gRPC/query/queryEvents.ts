import type { sendUnaryData } from "@grpc/grpc-js";
import {
  QueryEventsRequest,
  QueryEventsResponse,
  EventRow,
  AggregationRow,
} from "../../../gen/query/v1/query";
import { queryEventsSchema } from "../../../zod/query";
import { AuthError } from "../../../errors/auth";
import { EventError } from "../../../errors/event";
import { formatZodError } from "../../../utils/formatZodError";
import { StorageAdapterFactory } from "../../../factory";
import type {
  QueryRequest,
  QueryResponse,
} from "../../../interface/storage/Storage";
import type { WideEventBuilder } from "../../../context/requestContext";
import { apiKeyContextKey, type AuthContext } from "../../../context/auth";
import { wideEventContextKey } from "../../../context/requestContext";
import type { ContextUnaryCall } from "../../../interface/types/context.js";

export async function queryEvents(
  call: ContextUnaryCall<QueryEventsRequest, QueryEventsResponse>,
  callback?: sendUnaryData<QueryEventsResponse>
): Promise<void> {
  const c = call;
  const req = c.request;
  const wideEventBuilder = call[wideEventContextKey];

  try {
    const queryRequest = validateRequest(req);

    wideEventBuilder?.addContext({
      queryConditions: countConditions(queryRequest.where),
    });

    const auth = call[apiKeyContextKey];
    if (!auth) {
      return callback?.(AuthError.invalidAPIKey("API key context not found"));
    }

    const adapter =
      await StorageAdapterFactory.getEventStorageAdapter("BASIC_USAGE");
    const result = await adapter.query(queryRequest, auth);

    const response = buildProtoResponse(result, queryRequest);
    callback?.(null, response);
  } catch (error) {
    callback?.(error as Error);
  }
}

function countConditions(group: QueryRequest["where"]): number {
  let count = group.conditions.length;
  for (const g of group.groups) {
    count += countConditions(g);
  }
  return count;
}

function validateRequest(req: QueryEventsRequest): QueryRequest {
  try {
    return queryEventsSchema.parse({ ...req });
  } catch (error) {
    throw formatZodError(error, (msg) => EventError.validationFailed(msg));
  }
}

function buildEventRow(row: QueryResponse["rows"][number]): EventRow {
  const eventRow = EventRow.create();

  eventRow.eventId = String(row.eventId ?? "");
  eventRow.eventType = String(row.eventType ?? "");
  eventRow.userId = String(row.userId ?? "");
  eventRow.reportedTimestamp = String(row.reportedTimestamp ?? "");
  eventRow.ingestedTimestamp = String(row.ingestedTimestamp ?? "");

  if (row.basicUsageType != null) {
    eventRow.basicUsageType = String(row.basicUsageType);
  }
  if (row.debitAmount != null) {
    eventRow.debitAmount = Number(row.debitAmount);
  }
  if (row.model != null) {
    eventRow.model = String(row.model);
  }
  if (row.inputTokens != null) {
    eventRow.inputTokens = Number(row.inputTokens);
  }
  if (row.outputTokens != null) {
    eventRow.outputTokens = Number(row.outputTokens);
  }
  if (row.inputDebitAmount != null) {
    eventRow.inputDebitAmount = Number(row.inputDebitAmount);
  }
  if (row.outputDebitAmount != null) {
    eventRow.outputDebitAmount = Number(row.outputDebitAmount);
  }
  if (row.inputCacheTokens != null) {
    eventRow.inputCacheTokens = Number(row.inputCacheTokens);
  }
  if (row.inputCacheDebitAmount != null) {
    eventRow.inputCacheDebitAmount = Number(row.inputCacheDebitAmount);
  }
  if (row.metadata != null) {
    eventRow.metadata = JSON.stringify(row.metadata);
  }

  return eventRow;
}

function buildAggregationRow(row: QueryResponse["rows"][number]): AggregationRow {
  const aggRow = AggregationRow.create();
  if (row.group_value != null) {
    aggRow.groupValue = String(row.group_value);
  }
  aggRow.aggValue = String(row.agg_value ?? "0");
  return aggRow;
}

function buildProtoResponse(
  result: QueryResponse,
  request: QueryRequest
): QueryEventsResponse {
  const response = QueryEventsResponse.create();

  if (request.aggregation) {
    response.aggRows = result.rows.map(buildAggregationRow);
  } else {
    response.rows = result.rows.map(buildEventRow);
  }

  response.total = result.total;
  return response;
}
