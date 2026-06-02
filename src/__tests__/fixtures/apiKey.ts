import { getPostgresDB } from "../../storage/db/postgres/db";
import {
  apiKeysTable,
  webhookEndpointsTable,
} from "../../storage/db/postgres/schema";
import { hashAPIKey } from "../../utils/hashAPIKey";
import { DateTime } from "luxon";

export async function createTestApiKey(): Promise<{
  rawKey: string;
  id: string;
}> {
  const db = getPostgresDB();
  const rawKey = `scrn_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}`;
  const [key] = await db
    .insert(apiKeysTable)
    .values({
      name: `test-key-${crypto.randomUUID()}`,
      key: hashAPIKey(rawKey),
      role: "test",
      expiresAt: DateTime.utc().plus({ years: 1 }).toISO(),
    })
    .returning({ id: apiKeysTable.id });

  await db.insert(webhookEndpointsTable).values({
    apiKeyId: key!.id,
    url: "https://example.com/webhook",
    privateKey: "test-private-key",
    publicKey: "test-public-key",
  });

  return { rawKey, id: key!.id };
}

export async function insertKey(
  rawKey: string,
  role: "dashboard" | "test" | "production",
  overrides: Partial<{ revoked: boolean; expiresAt: string }> = {}
): Promise<string> {
  const db = getPostgresDB();
  const [key] = await db
    .insert(apiKeysTable)
    .values({
      name: `auth-test-key-${crypto.randomUUID()}`,
      key: hashAPIKey(rawKey),
      role,
      expiresAt:
        overrides.expiresAt ?? DateTime.utc().plus({ years: 1 }).toISO(),
      revoked: overrides.revoked ?? false,
    })
    .returning({ id: apiKeysTable.id });
  return key!.id;
}
