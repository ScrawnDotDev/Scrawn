import { getPostgresDB } from "../../storage/db/postgres/db";
import {
  apiKeysTable,
  webhookEndpointsTable,
  projectTable,
} from "../../storage/db/postgres/schema";
import { hashAPIKey } from "../../utils/hashAPIKey";
import { DateTime } from "luxon";

export const TEST_PROJECT_ID = "00000000-0000-0000-0000-000000000001";

export async function ensureTestProject(): Promise<void> {
  const db = getPostgresDB();
  await db
    .insert(projectTable)
    .values({ project_id: TEST_PROJECT_ID, product_id: "test-product" })
    .onConflictDoNothing({ target: projectTable.project_id });
}

export async function createTestApiKey(): Promise<{
  rawKey: string;
  id: string;
}> {
  await ensureTestProject();
  const db = getPostgresDB();
  const rawKey = `scrn_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}`;
  const [key] = await db
    .insert(apiKeysTable)
    .values({
      name: `test-key-${crypto.randomUUID()}`,
      key: hashAPIKey(rawKey),
      role: "test",
      expiresAt: DateTime.utc().plus({ years: 1 }).toISO(),
      project_id: TEST_PROJECT_ID,
    })
    .returning({ id: apiKeysTable.id });

  await db.insert(webhookEndpointsTable).values({
    apiKeyId: key!.id,
    url: "https://example.com/webhook",
    privateKey: "test-private-key",
    publicKey: "test-public-key",
    project_id: TEST_PROJECT_ID,
  });

  return { rawKey, id: key!.id };
}

export async function insertKey(
  rawKey: string,
  role: "dashboard" | "test" | "production",
  overrides: Partial<{ revoked: boolean; expiresAt: string }> = {}
): Promise<string> {
  await ensureTestProject();
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
      project_id: TEST_PROJECT_ID,
    })
    .returning({ id: apiKeysTable.id });
  return key!.id;
}
