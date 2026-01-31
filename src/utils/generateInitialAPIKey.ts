import { randomBytes, createHmac } from "crypto";
import { randomUUID } from "crypto";

const HMAC_SECRET = process.env.HMAC_SECRET;

if (!HMAC_SECRET) {
  throw new Error(
    "HMAC_SECRET environment variable is not set. (check .env.example file)"
  );
}

// Type assertion after validation
const SECRET: string = HMAC_SECRET;

/**
 * Generate an API key in the same format as the main system
 */
function generateAPIKey(): string {
  const randomPart = randomBytes(24)
    .toString("base64")
    .replace(/[+/=]/g, (char) => {
      const replacements: { [key: string]: string } = {
        "+": "a",
        "/": "b",
        "=": "c",
      };
      return replacements[char] || char;
    })
    .substring(0, 32);

  return `scrn_${randomPart}`;
}

/**
 * Hash an API key using HMAC-SHA256
 */
function hashAPIKey(apiKey: string): string {
  return createHmac("sha256", SECRET).update(apiKey).digest("hex");
}

export type InitialApiKeyData = {
  apiKeyId: string;
  apiKey: string;
  apiKeyHash: string;
  name: string;
  createdAt: string;
  expiresAt: string;
  insertSql: string;
  authorizationHeader: string;
};

export function generateInitialApiKeyData(): InitialApiKeyData {
  const apiKeyId = randomUUID();
  const apiKey = generateAPIKey();
  const apiKeyHash = hashAPIKey(apiKey);
  const name = "Dashboard Key";
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + 365 * 24 * 60 * 60 * 1000
  ).toISOString(); // 1 year from now

  const insertSql =
    "INSERT INTO api_keys (id, name, key, created_at, expires_at, revoked, revoked_at)\n" +
    "VALUES (\n" +
    `  '${apiKeyId}',\n` +
    `  '${name}',\n` +
    `  '${apiKeyHash}',\n` +
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
    createdAt,
    expiresAt,
    insertSql,
    authorizationHeader: `Authorization: Bearer ${apiKey}`,
  };
}
