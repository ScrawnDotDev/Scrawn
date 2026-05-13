import { createHmac, randomUUID } from "crypto";
import { generateAPIKey } from "./generateAPIKey";
import { DateTime } from "luxon";

const HMAC_SECRET = process.env.HMAC_SECRET;

if (!HMAC_SECRET) {
  throw new Error(
    "HMAC_SECRET environment variable is not set. (check .env.example file)"
  );
}

const SECRET: string = HMAC_SECRET;

function hashAPIKey(apiKey: string): string {
  return createHmac("sha256", SECRET).update(apiKey).digest("hex");
}

export type InitialApiKeyData = {
  apiKeyId: string;
  apiKey: string;
  apiKeyHash: string;
  name: string;
  role: string;
  createdAt: string;
  expiresAt: string;
  insertSql: string;
  authorizationHeader: string;
};

export function generateInitialApiKeyData(): InitialApiKeyData {
  const apiKeyId = randomUUID();
  const apiKey = generateAPIKey("dashboard");
  const apiKeyHash = hashAPIKey(apiKey);
  const name = "Dashboard Key";
  const role = "dashboard";
  const createdAt = DateTime.utc().toISO();
  const expiresAt = DateTime.utc().plus({ days: 365 }).toISO();

  const insertSql =
    "INSERT INTO api_keys (id, name, key, role, created_at, expires_at, revoked, revoked_at)\n" +
    "VALUES (\n" +
    `  '${apiKeyId}',\n` +
    `  '${name}',\n` +
    `  '${apiKeyHash}',\n` +
    `  '${role}',\n` +
    `  '${createdAt}',\n` +
    `  '${expiresAt}',\n` +
    "  false,\n" +
    "  NULL\n" +
    ");";

  return {
    apiKeyId,
    apiKey,
    apiKeyHash,
    name,
    role,
    createdAt,
    expiresAt,
    insertSql,
    authorizationHeader: `Authorization: Bearer ${apiKey}`,
  };
}
