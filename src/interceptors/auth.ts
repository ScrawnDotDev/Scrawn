import type { Interceptor } from "@connectrpc/connect";
import { apiKeyContextKey } from "../context/auth";
import { wideEventContextKey } from "../context/requestContext";
import { AuthError } from "../errors/auth";
import { apiKeyCache } from "../utils/apiKeyCache";
import { getPostgresDB } from "../storage/db/postgres/db";
import { apiKeysTable } from "../storage/db/postgres/schema";
import { eq } from "drizzle-orm";
import { hashAPIKey } from "../utils/hashAPIKey";

export const no_auth: string[] = [] as const;

export function authInterceptor(): Interceptor {
  return (next) => async (req) => {
    // Skip auth for whitelisted endpoints
    for (const path of no_auth) {
      if (req.url.endsWith(path)) {
        return await next(req);
      }
    }

    const wideEventBuilder = req.contextValues.get(wideEventContextKey);

    // Extract and validate authorization header
    const authorization = req.header.get("Authorization");
    if (!authorization) {
      throw AuthError.missingHeader();
    }

    if (!authorization.startsWith("Bearer ")) {
      throw AuthError.invalidHeaderFormat();
    }

    const apiKey = authorization.slice("Bearer ".length).trim();

    // Validate API key format
    if (!apiKey.startsWith("scrn_") || apiKey.length !== 37) {
      throw AuthError.invalidAPIKey("Invalid API key format");
    }

    const apiKeyHash = hashAPIKey(apiKey);

    // Check cache first
    const cached = apiKeyCache.get(apiKeyHash);
    if (cached) {
      req.contextValues.set(apiKeyContextKey, cached.id);
      wideEventBuilder?.setAuth(cached.id, true);
      return await next(req);
    }

    // Query database for API key
    const apiKeyRecord = await lookupApiKey(apiKeyHash);

    if (!apiKeyRecord) {
      throw AuthError.invalidAPIKey("API key not found");
    }

    if (apiKeyRecord.revoked) {
      throw AuthError.revokedAPIKey();
    }

    if (new Date() > new Date(apiKeyRecord.expiresAt)) {
      throw AuthError.expiredAPIKey();
    }

    // Cache and set context
    apiKeyCache.set(apiKeyHash, {
      id: apiKeyRecord.id,
      expiresAt: apiKeyRecord.expiresAt,
    });

    req.contextValues.set(apiKeyContextKey, apiKeyRecord.id);
    wideEventBuilder?.setAuth(apiKeyRecord.id, false);

    return await next(req);
  };
}

async function lookupApiKey(apiKeyHash: string) {
  const db = getPostgresDB();
  const result = await db
    .select({
      id: apiKeysTable.id,
      expiresAt: apiKeysTable.expiresAt,
      revoked: apiKeysTable.revoked,
    })
    .from(apiKeysTable)
    .where(eq(apiKeysTable.key, apiKeyHash))
    .limit(1);

  return result[0];
}
