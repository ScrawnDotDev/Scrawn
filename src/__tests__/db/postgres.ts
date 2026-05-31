import { eq } from "drizzle-orm";
import { getPostgresDB } from "../../storage/db/postgres/db";
import {
  basicUsageEventsTable,
  apiKeysTable,
} from "../../storage/db/postgres/schema";
import type {
  TestDBAdapter,
  NormalizedBasicUsageEvent,
  NormalizedAPIKey,
} from "./types";

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
