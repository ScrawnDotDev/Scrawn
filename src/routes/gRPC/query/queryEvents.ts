import type { sendUnaryData } from "@grpc/grpc-js";
import {
  QueryEventsRequest,
  QueryEventsResponse,
  EventRow,
  AggregationRow,
} from "../../../gen/query/v1/query_pb.js";
import {
  queryEventsSchema,
  type QueryEventsSchemaType,
} from "../../../zod/query";
import { EventError } from "../../../errors/event";
import { formatZodError } from "../../../utils/formatZodError";
import { StorageAdapterFactory } from "../../../factory";
import type {
  StorageAdapter,
  QueryRequest,
  QueryResponse,
} from "../../../interface/storage/Storage";
import type { WideEventBuilder } from "../../../context/requestContext";
import { apiKeyContextKey } from "../../../context/auth";
import { wideEventContextKey } from "../../../context/requestContext";
import type { ContextUnaryCall } from "../../../interface/types/context.js";
import type { EventKind } from "../../../interface/event/Event";

export async function queryEvents(
  call: ContextUnaryCall<QueryEventsRequest, QueryEventsResponse>,
  callback?: sendUnaryData<QueryEventsResponse>
): Promise<void> {
  const c = call;
  const req = c.request;
  const wideEventBuilder = call[wideEventContextKey];

  try {
    const validated = validateRequest(req);

    const queryRequest: QueryRequest = {
      filters: validated.filtersList.map((f) => ({
        field: f.field,
        operator: f.operator,
        value: f.value,
      })),
      aggregation: validated.aggregation
        ? {
            type: validated.aggregation.type,
            field: validated.aggregation.field,
          }
        : undefined,
      groupBy: validated.groupBy?.field,
      limit: validated.limit,
      offset: validated.offset,
    };

    wideEventBuilder?.addContext({ queryFilters: queryRequest.filters.length });

    const eventTypes = resolveEventTypes(queryRequest.filters);
    const adapters = await getUniqueAdapters(eventTypes);

    const allResponses = await Promise.all(
      adapters.map((adapter) => adapter.query(queryRequest))
    );

    const merged = mergeResponses(allResponses, queryRequest);

    const response = buildProtoResponse(merged, queryRequest);
    callback?.(null, response);
  } catch (error) {
    callback?.(error as Error);
  }
}

function validateRequest(req: QueryEventsRequest): QueryEventsSchemaType {
  try {
    return queryEventsSchema.parse(req.toObject());
  } catch (error) {
    throw formatZodError(error, (msg) => EventError.validationFailed(msg));
  }
}

function resolveEventTypes(filters: QueryRequest["filters"]): EventKind[] {
  const eventTypeFilter = filters.find((f) => f.field === "eventType");
  if (eventTypeFilter) {
    const v = eventTypeFilter.value;
    if (v === "SDK_CALL" || v === "AI_TOKEN_USAGE" || v === "PAYMENT") {
      return [v];
    }
    return [];
  }
  return ["SDK_CALL", "AI_TOKEN_USAGE", "PAYMENT"];
}

async function getUniqueAdapters(
  eventTypes: EventKind[]
): Promise<StorageAdapter[]> {
  const adapterMap = new Map<string, StorageAdapter>();

  for (const eventType of eventTypes) {
    const adapter =
      await StorageAdapterFactory.getEventStorageAdapter(eventType);
    const key = adapter.constructor.name;
    if (!adapterMap.has(key)) {
      adapterMap.set(key, adapter);
    }
  }

  return Array.from(adapterMap.values());
}

function mergeResponses(
  responses: QueryResponse[],
  request: QueryRequest
): QueryResponse {
  if (responses.length === 0) {
    return { rows: [], total: 0 };
  }

  if (responses.length === 1 && responses[0]) {
    return responses[0];
  }

  const isAgg = !!request.aggregation;

  if (isAgg) {
    // For aggregations, concatenate rows (each adapter returns its own group/sum)
    const allRows = responses.flatMap((r) => r.rows);
    return { rows: allRows, total: allRows.length };
  }

  // For list queries, merge and sort by timestamp
  const allRows = responses.flatMap((r) => r.rows);
  allRows.sort((a, b) => {
    const aTs = String(a.reportedTimestamp ?? "");
    const bTs = String(b.reportedTimestamp ?? "");
    return bTs.localeCompare(aTs);
  });

  const totalCount = responses.reduce((sum, r) => sum + r.total, 0);
  const offset = request.offset ?? 0;
  const limit = request.limit ?? 100;
  const paginated = allRows.slice(offset, offset + limit);

  return { rows: paginated, total: totalCount };
}

function buildProtoResponse(
  merged: QueryResponse,
  request: QueryRequest
): QueryEventsResponse {
  const response = new QueryEventsResponse();

  if (request.aggregation) {
    for (const row of merged.rows) {
      const aggRow = new AggregationRow();
      if (row.group_value != null) {
        aggRow.setGroupValue(String(row.group_value));
      }
      aggRow.setAggValue(String(row.agg_value ?? "0"));
      response.addAggRows(aggRow);
    }
  } else {
    for (const row of merged.rows) {
      const eventRow = new EventRow();
      eventRow.setEventId(String(row.eventId ?? ""));
      eventRow.setEventType(String(row.eventType ?? ""));
      eventRow.setUserId(String(row.userId ?? ""));
      eventRow.setReportedTimestamp(String(row.reportedTimestamp ?? ""));
      eventRow.setIngestedTimestamp(String(row.ingestedTimestamp ?? ""));

      if (row.sdkCallType != null) {
        eventRow.setSdkCallType(String(row.sdkCallType));
      }
      if (row.debitAmount != null) {
        eventRow.setDebitAmount(Number(row.debitAmount));
      }
      if (row.creditAmount != null) {
        eventRow.setCreditAmount(Number(row.creditAmount));
      }
      if (row.model != null) {
        eventRow.setModel(String(row.model));
      }
      if (row.inputTokens != null) {
        eventRow.setInputTokens(Number(row.inputTokens));
      }
      if (row.outputTokens != null) {
        eventRow.setOutputTokens(Number(row.outputTokens));
      }
      if (row.inputDebitAmount != null) {
        eventRow.setInputDebitAmount(Number(row.inputDebitAmount));
      }
      if (row.outputDebitAmount != null) {
        eventRow.setOutputDebitAmount(Number(row.outputDebitAmount));
      }

      response.addRows(eventRow);
    }
  }

  response.setTotal(merged.total);
  return response;
}
