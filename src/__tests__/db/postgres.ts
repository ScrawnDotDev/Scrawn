import { eq } from "drizzle-orm";
import { getPostgresDB } from "../../storage/db/postgres/db";
import { basicUsageEventsTable } from "../../storage/db/postgres/schema";
import type { TestDBAdapter, NormalizedBasicUsageEvent } from "./types";

export class PostgresTestDB implements TestDBAdapter {
  async findBasicUsageEvent(
    eventId: string
  ): Promise<NormalizedBasicUsageEvent | undefined> {
    const db = getPostgresDB();
    const [row] = await db
      .select()
      .from(basicUsageEventsTable)
      .where(eq(basicUsageEventsTable.eventId, eventId))
      .limit(1);

    if (!row) return undefined;

    return {
      eventId: row.eventId,
      idempotencyKey: row.idempotencyKey,
      userId: row.userId,
      apiKeyId: row.apiKeyId,
      mode: row.mode,
      type: row.type,
      debitAmount: row.debitAmount,
    };
  }
}
