import { getPostgresDB } from "../../storage/db/postgres/db";
import { apiKeysTable } from "../../storage/db/postgres/schema";
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
  return { rawKey, id: key!.id };
}
