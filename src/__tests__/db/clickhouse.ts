import { eq } from "drizzle-orm";
import { getClickHouseDB } from "../../storage/db/clickhouse";
import { getPostgresDB } from "../../storage/db/postgres/db";
import { apiKeysTable } from "../../storage/db/postgres/schema";
import type {
  TestDBAdapter,
  NormalizedBasicUsageEvent,
  NormalizedAPIKey,
} from "./types";

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

  async findAPIKey(apiKeyId: string): Promise<NormalizedAPIKey | undefined> {
    const db = getPostgresDB();
    const [row] = await db
      .select()
      .from(apiKeysTable)
      .where(eq(apiKeysTable.id, apiKeyId))
      .limit(1);

    if (!row) return undefined;

    return {
      id: row.id,
      name: row.name,
      role: row.role,
      revoked: row.revoked,
    };
  }
}
