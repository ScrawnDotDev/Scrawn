import { getClickHouseDB } from "../../../db/clickhouse";
import { StorageError } from "../../../../errors/storage";
import { type SqlRecordOf } from "../../../../interface/event/Event";
import type { UserId } from "../../../../config/identifiers";
import { DateTime } from "luxon";
import { toClickHouseDateTime } from "../utils";
import type { AuthContext } from "../../../../context/auth";
import { ensureUserExists } from "../../../db/postgres/helpers/users";

type AggregatedEvent = {
  userId: UserId;
  model: string;
  provider: string;
  inputTokens: number;
  inputCacheTokens: number;
  outputTokens: number;
  outputCacheTokens: number;
  inputDebitAmount: number;
  inputCacheDebitAmount: number;
  outputCacheDebitAmount: number;
  outputDebitAmount: number;
  reported_timestamp: string;
  eventId: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
};

function validateNonNegative(
  value: unknown,
  label: string,
  userId: UserId
): void {
  if (typeof value === "number" && value < 0) {
    throw StorageError.insertFailed(
      `Negative ${label} not allowed for AI token usage for user ${userId}`,
      new Error(`${label} ${value} is negative`)
    );
  }
}

function validateAiTokenEvent(event_data: SqlRecordOf<"AI_TOKEN_USAGE">): void {
  const { userId, data } = event_data;
  validateNonNegative(data.inputTokens, "inputTokens", userId);
  validateNonNegative(data.outputTokens, "outputTokens", userId);
  validateNonNegative(data.inputDebitAmount, "inputDebitAmount", userId);
  validateNonNegative(data.outputDebitAmount, "outputDebitAmount", userId);
  validateNonNegative(data.inputCacheTokens, "inputCacheTokens", userId);
  validateNonNegative(
    data.inputCacheDebitAmount,
    "inputCacheDebitAmount",
    userId
  );
  validateNonNegative(data.outputCacheTokens, "outputCacheTokens", userId);
  validateNonNegative(
    data.outputCacheDebitAmount,
    "outputCacheDebitAmount",
    userId
  );
}

function aggregateAiTokenEvents(
  events: Array<SqlRecordOf<"AI_TOKEN_USAGE">>
): AggregatedEvent[] {
  const aggregationMap = new Map<string, AggregatedEvent>();

  for (const event_data of events) {
    if (!event_data.reported_timestamp.isValid) {
      throw StorageError.invalidTimestamp(
        "reported_timestamp is not a valid DateTime"
      );
    }
    const reportedTimestamp = toClickHouseDateTime(
      event_data.reported_timestamp
    );
    const key = `${event_data.userId}:${event_data.data.model}:${event_data.idempotencyKey}`;
    const existing = aggregationMap.get(key);

    if (existing) {
      existing.inputTokens += event_data.data.inputTokens;
      existing.inputCacheTokens += event_data.data.inputCacheTokens;
      existing.outputCacheTokens += event_data.data.outputCacheTokens;
      existing.outputTokens += event_data.data.outputTokens;
      existing.inputDebitAmount += event_data.data.inputDebitAmount;
      existing.inputCacheDebitAmount += event_data.data.inputCacheDebitAmount;
      existing.outputCacheDebitAmount += event_data.data.outputCacheDebitAmount;
      existing.outputDebitAmount += event_data.data.outputDebitAmount;
      if (reportedTimestamp > existing.reported_timestamp) {
        existing.reported_timestamp = reportedTimestamp;
      }
    } else {
      aggregationMap.set(key, {
        userId: event_data.userId,
        model: event_data.data.model,
        provider: event_data.data.provider,
        inputTokens: event_data.data.inputTokens,
        inputCacheTokens: event_data.data.inputCacheTokens,
        outputCacheTokens: event_data.data.outputCacheTokens,
        outputTokens: event_data.data.outputTokens,
        inputDebitAmount: event_data.data.inputDebitAmount,
        inputCacheDebitAmount: event_data.data.inputCacheDebitAmount,
        outputCacheDebitAmount: event_data.data.outputCacheDebitAmount,
        outputDebitAmount: event_data.data.outputDebitAmount,
        reported_timestamp: reportedTimestamp,
        eventId: event_data.eventId,
        idempotencyKey: event_data.idempotencyKey,
        metadata: event_data.data.metadata,
      });
    }
  }

  return Array.from(aggregationMap.values());
}

function buildAiTokenInsertRows(
  aggregatedEvents: AggregatedEvent[],
  auth: AuthContext,
  firstId: string,
  now: string
): Array<Record<string, unknown>> {
  return aggregatedEvents.map((aggEvent, index) => {
    const metrics = JSON.stringify({
      tokens: {
        input: aggEvent.inputTokens,
        input_cache: aggEvent.inputCacheTokens,
        output: aggEvent.outputTokens,
        output_cache: aggEvent.outputCacheTokens,
      },
      debit_amount: {
        input: aggEvent.inputDebitAmount,
        input_cache: aggEvent.inputCacheDebitAmount,
        output: aggEvent.outputDebitAmount,
        output_cache: aggEvent.outputCacheDebitAmount,
      },
    });

    return {
      id: index === 0 ? firstId : crypto.randomUUID(),
      event_id: aggEvent.eventId,
      idempotency_key: aggEvent.idempotencyKey,
      user_id: aggEvent.userId,
      api_key_id: auth.apiKeyId,
      project_id: auth.projectId,
      mode: auth.mode,
      reported_timestamp: aggEvent.reported_timestamp,
      ingested_timestamp: now,
      model: aggEvent.model,
      provider: aggEvent.provider,
      metrics,
      metadata: aggEvent.metadata ?? null,
    };
  });
}

export async function handleAddAiTokenUsage(
  events: Array<SqlRecordOf<"AI_TOKEN_USAGE">>,
  auth: AuthContext
): Promise<{ id: string } | void> {
  const client = getClickHouseDB();

  if (events.length === 0) {
    return;
  }

  for (const event_data of events) {
    validateAiTokenEvent(event_data);
  }

  const firstEvent = events[0];
  if (firstEvent) {
    await ensureUserExists(firstEvent.userId);
  }

  const aggregatedEvents = aggregateAiTokenEvents(events);

  const firstId = crypto.randomUUID();
  const now = toClickHouseDateTime(DateTime.utc());
  const values = buildAiTokenInsertRows(aggregatedEvents, auth, firstId, now);

  try {
    await client.insert({
      table: "ai_token_usage_events",
      values,
      format: "JSONEachRow",
    });
  } catch (e) {
    throw StorageError.insertFailed(
      "Failed to insert AI token usage events",
      e instanceof Error ? e : new Error(String(e))
    );
  }

  return { id: firstId };
}
