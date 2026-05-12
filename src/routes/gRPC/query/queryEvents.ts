import type { sendUnaryData } from "@grpc/grpc-js";
import {
  QueryEventsRequest,
  QueryEventsResponse,
  EventRow,
  AggregationRow,
} from "../../../gen/query/v1/query_pb.js";
import { queryEventsSchema } from "../../../zod/query";
import { EventError } from "../../../errors/event";
import { formatZodError } from "../../../utils/formatZodError";
import { StorageAdapterFactory } from "../../../factory";
import type { QueryRequest, QueryResponse } from "../../../interface/storage/Storage";
import type { WideEventBuilder } from "../../../context/requestContext";
import { apiKeyContextKey } from "../../../context/auth";
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

    const adapter = await StorageAdapterFactory.getEventStorageAdapter("SDK_CALL");
    const result = await adapter.query(queryRequest);

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
    return queryEventsSchema.parse(req.toObject()) as QueryRequest;
  } catch (error) {
    throw formatZodError(error, (msg) => EventError.validationFailed(msg));
  }
}

function buildProtoResponse(
  result: QueryResponse,
  request: QueryRequest
): QueryEventsResponse {
  const response = new QueryEventsResponse();

  if (request.aggregation) {
    for (const row of result.rows) {
      const aggRow = new AggregationRow();
      if (row.group_value != null) {
        aggRow.setGroupValue(String(row.group_value));
      }
      aggRow.setAggValue(String(row.agg_value ?? "0"));
      response.addAggRows(aggRow);
    }
  } else {
    for (const row of result.rows) {
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

  response.setTotal(result.total);
  return response;
}
