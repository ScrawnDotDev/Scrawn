import { getClickHouseDB } from "../../../db/clickhouse";
import { StorageError } from "../../../../errors/storage";
import { type SqlRecordOf } from "../../../../interface/event/Event";
import { DateTime } from "luxon";
import { toClickHouseDateTime } from "../utils";

export async function handleAddSdkCall(
  event_data: SqlRecordOf<"SDK_CALL">,
  apiKeyId: string,
  mode?: "production" | "test"
): Promise<{ id: string }> {
  const client = getClickHouseDB();

  const debitAmount = event_data.data.debitAmount;
  if (typeof debitAmount === "number" && debitAmount < 0) {
    throw StorageError.insertFailed(
      `Negative debit amount not allowed for SDK call for user ${event_data.userId}`,
      new Error(`debitAmount ${debitAmount} is negative`)
    );
  }

  if (!event_data.reported_timestamp.isValid) {
    throw StorageError.invalidTimestamp(
      "reported_timestamp is not a valid DateTime"
    );
  }
  const reportedTimestamp = toClickHouseDateTime(event_data.reported_timestamp);

  const id = crypto.randomUUID();

  try {
    await client.insert({
      table: "sdk_call_events",
      values: [
        {
          id,
          user_id: event_data.userId,
          api_key_id: apiKeyId,
          mode: mode ?? "production",
          reported_timestamp: reportedTimestamp,
          ingested_timestamp: toClickHouseDateTime(DateTime.utc()),
          sdk_call_type: event_data.data.sdkCallType,
          debit_amount: debitAmount,
        },
      ],
      format: "JSONEachRow",
    });
  } catch (e) {
    throw StorageError.insertFailed(
      `Failed to insert SDK call event for user ${event_data.userId}`,
      e instanceof Error ? e : new Error(String(e))
    );
  }

  return { id };
}
