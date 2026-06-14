import { getClickHouseDB } from "../../../db/clickhouse";
import { StorageError } from "../../../../errors/storage";
import { type SqlRecordOf } from "../../../../interface/event/Event";
import { DateTime } from "luxon";
import { toClickHouseDateTime } from "../utils";
import type { AuthContext } from "../../../../context/auth";
import { ensureUserExists } from "../../../db/postgres/helpers/users";

export async function handleAddBasicUsage(
  event_data: SqlRecordOf<"BASIC_USAGE">,
  auth: AuthContext
): Promise<{ id: string }> {
  const client = getClickHouseDB();

  const debitAmount = event_data.data.debitAmount;
  if (typeof debitAmount === "number" && debitAmount < 0) {
    throw StorageError.insertFailed(
      `Negative debit amount not allowed for basic usage event for user ${event_data.userId}`,
      new Error(`debitAmount ${debitAmount} is negative`)
    );
  }

  if (!event_data.reported_timestamp.isValid) {
    throw StorageError.invalidTimestamp(
      "reported_timestamp is not a valid DateTime"
    );
  }
  const reportedTimestamp = toClickHouseDateTime(event_data.reported_timestamp);

  await ensureUserExists(event_data.userId, auth.project_id);

  const id = crypto.randomUUID();

  try {
    await client.insert({
      table: "basic_usage_events",
      values: [
        {
          id,
          event_id: event_data.eventId,
          idempotency_key: event_data.idempotencyKey,
          user_id: event_data.userId,
          api_key_id: auth.apiKeyId,
          mode: auth.mode,
          reported_timestamp: reportedTimestamp,
          ingested_timestamp: toClickHouseDateTime(DateTime.utc()),
          type: event_data.data.basicUsageType,
          debit_amount: debitAmount,
          metadata: event_data.data.metadata ?? null,
        },
      ],
      format: "JSONEachRow",
    });
  } catch (e) {
    throw StorageError.insertFailed(
      `Failed to insert basic usage event for user ${event_data.userId}`,
      e instanceof Error ? e : new Error(String(e))
    );
  }

  return { id };
}
