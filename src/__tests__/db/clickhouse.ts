import { getClickHouseDB } from "../../storage/db/clickhouse";
import type { TestDBAdapter, NormalizedBasicUsageEvent } from "./types";

type ClickHouseBasicUsageRow = {
  event_id: string;
  idempotency_key: string;
  user_id: string;
  api_key_id: string | null;
  mode: string;
  type: string;
  debit_amount: number;
};

export class ClickHouseTestDB implements TestDBAdapter {
  async findBasicUsageEvent(
    eventId: string
  ): Promise<NormalizedBasicUsageEvent | undefined> {
    const result = await getClickHouseDB().query({
      query: `SELECT * FROM basic_usage_events WHERE event_id = {eventId:String}`,
      query_params: { eventId },
      format: "JSONEachRow",
    });
    const rows = (await result.json()) as ClickHouseBasicUsageRow[];
    const row = rows[0];

    if (!row) return undefined;

    return {
      eventId: row.event_id,
      idempotencyKey: row.idempotency_key,
      userId: row.user_id,
      apiKeyId: row.api_key_id,
      mode: row.mode,
      type: row.type,
      debitAmount: row.debit_amount,
    };
  }
}
