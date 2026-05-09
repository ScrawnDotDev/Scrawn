import { getClickHouseDB } from "../../../db/clickhouse";
import { StorageError } from "../../../../errors/storage";
import { type SqlRecord } from "../../../../interface/event/Event";
import { DateTime } from "luxon";

export async function handleAddSdkCall(
  event_data: SqlRecord<"SDK_CALL">,
  apiKeyId: string
): Promise<{ id: string }> {
  const client = getClickHouseDB();

  const debitAmount = event_data.data.debitAmount;
  if (typeof debitAmount === "number" && debitAmount < 0) {
    throw StorageError.insertFailed(
      `Negative debit amount not allowed for SDK call for user ${event_data.userId}`,
      new Error(`debitAmount ${debitAmount} is negative`)
    );
  }

  const reportedTimestamp = event_data.reported_timestamp.toISO();
  if (!reportedTimestamp) {
    throw StorageError.invalidTimestamp(
      "Failed to convert reported_timestamp to ISO format"
    );
  }

  const id = crypto.randomUUID();

  try {
    await client.insert({
      table: "sdk_call_events",
      values: [
        {
          id,
          user_id: event_data.userId,
          api_key_id: apiKeyId,
          reported_timestamp: reportedTimestamp,
          ingested_timestamp: DateTime.utc().toString(),
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
