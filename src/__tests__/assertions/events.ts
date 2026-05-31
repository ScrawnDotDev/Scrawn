import { expect } from "vitest";
import { testDB } from "../db";

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

export async function verifyApiKeyCreated(expected: {
  name: string;
  role: string;
  revoked: boolean;
  id: string;
}) {
  const db = await testDB;
  const row = await db.findAPIKey(expected.id);

  expect(row).toBeDefined();
  expect(row!.name).toBe(expected.name);
  expect(row!.role).toBe(expected.role);
  expect(row!.revoked).toBe(expected.revoked);
}
