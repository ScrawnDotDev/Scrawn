import { expect } from "vitest";
import { testDB } from "../db";
import type { NormalizedAPIKey } from "../db/types";
import { eq } from "drizzle-orm";
import { getPostgresDB } from "../../storage/db/postgres/db";
import { apiKeysTable } from "../../storage/db/postgres/schema";

export async function verifyBasicUsageEventStored(expected: {
  userId: string;
  eventId: string;
  idempotencyKey: string;
  debitAmount: number;
  apiKeyId: string;
  type: string;
}): Promise<void> {
  const db = await testDB;
  const row = await db.findBasicUsageEvent(expected.eventId);

  expect(row).toBeDefined();
  expect(row!.eventId).toBe(expected.eventId);
  expect(row!.idempotencyKey).toBe(expected.idempotencyKey);
  expect(row!.userId).toBe(expected.userId);
  expect(row!.apiKeyId).toBe(expected.apiKeyId);
  expect(row!.mode).toBe("test");
  expect(row!.type).toBe(expected.type);
  expect(row!.debitAmount).toBe(expected.debitAmount);
}

async function findAPIKey(
  apiKeyId: string
): Promise<NormalizedAPIKey | undefined> {
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

export async function verifyApiKeyCreated(expected: {
  name: string;
  role: string;
  revoked: boolean;
  id: string;
}) {
  const row = await findAPIKey(expected.id);

  expect(row).toBeDefined();
  expect(row!.name).toBe(expected.name);
  expect(row!.role).toBe(expected.role);
  expect(row!.revoked).toBe(expected.revoked);
}
