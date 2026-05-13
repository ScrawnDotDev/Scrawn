import { getPostgresDB } from "../db";
import { apiKeysTable } from "../schema";
import { StorageError } from "../../../../errors/storage";
import { eq } from "drizzle-orm";

type CreateApiKeyInput = {
  name: string;
  key: string;
  role: string;
  expiresAt: string;
};

export async function createApiKey(
  input: CreateApiKeyInput
): Promise<{ id: string }> {
  const db = getPostgresDB();

  if (!input.name || typeof input.name !== "string") {
    throw StorageError.invalidData(
      "Invalid or missing 'name' in createApiKey"
    );
  }

  if (!input.key || typeof input.key !== "string") {
    throw StorageError.invalidData(
      "Invalid or missing 'key' in createApiKey"
    );
  }

  if (input.key.trim().length === 0) {
    throw StorageError.invalidData("API key cannot be empty");
  }

  try {
    const [apiKeyRecord] = await db
      .insert(apiKeysTable)
      .values({
        name: input.name,
        key: input.key,
        role: input.role as "dashboard" | "production" | "test",
        expiresAt: input.expiresAt,
      })
      .returning({ id: apiKeysTable.id });

    if (!apiKeyRecord) {
      throw StorageError.emptyResult("API key insert returned no record");
    }

    if (!apiKeyRecord.id) {
      throw StorageError.emptyResult(
        "API key insert returned object without id field"
      );
    }

    return apiKeyRecord;
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message.includes("unique") || e.message.includes("duplicate"))
    ) {
      throw StorageError.constraintViolation(
        `API key with name '${input.name}' or key value already exists`,
        e
      );
    }

    throw StorageError.insertFailed(
      `Failed to insert API key '${input.name}'`,
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

type ApiKeyRecord = {
  id: string;
  role: string;
  expiresAt: string;
  revoked: boolean;
};

export async function findApiKeyByHash(
  apiKeyHash: string
): Promise<ApiKeyRecord | null> {
  const db = getPostgresDB();

  try {
    const [apiKeyRecord] = await db
      .select({
        id: apiKeysTable.id,
        role: apiKeysTable.role,
        expiresAt: apiKeysTable.expiresAt,
        revoked: apiKeysTable.revoked,
      })
      .from(apiKeysTable)
      .where(eq(apiKeysTable.key, apiKeyHash))
      .limit(1);

    return apiKeyRecord ?? null;
  } catch (e) {
    throw StorageError.queryFailed(
      "Failed to look up API key",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}
