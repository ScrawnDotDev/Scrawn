import { getClickHouseDB } from "../../../db/clickhouse";
import { StorageError } from "../../../../errors/storage";
import { type SqlRecordOf } from "../../../../interface/event/Event";
import { DateTime } from "luxon";
import { toClickHouseDateTime } from "../utils";

export async function handleAddPayment(
  event_data: SqlRecordOf<"PAYMENT">,
  apiKeyId?: string,
  mode?: "production" | "test"
): Promise<{ id: string }> {
  const client = getClickHouseDB();

  const creditAmount = event_data.data.creditAmount;
  if (
    typeof creditAmount !== "number" ||
    !Number.isFinite(creditAmount) ||
    creditAmount < 0
  ) {
    throw StorageError.insertFailed(
      `Invalid credit amount for payment event for user ${event_data.userId}`,
      new Error(`creditAmount ${creditAmount} is invalid`)
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
      table: "payment_events",
      values: [
        {
          id,
          user_id: event_data.userId,
          mode: mode ?? "production",
          reported_timestamp: reportedTimestamp,
          ingested_timestamp: toClickHouseDateTime(DateTime.utc()),
          credit_amount: creditAmount,
        },
      ],
      format: "JSONEachRow",
    });
  } catch (e) {
    throw StorageError.insertFailed(
      `Failed to insert payment event for user ${event_data.userId}`,
      e instanceof Error ? e : new Error(String(e))
    );
  }

  return { id };
}
