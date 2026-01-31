import { type Interceptor } from "@connectrpc/connect";
import { apiKeyContextKey } from "../context/auth";
import { AuthError, AuthErrorType } from "../errors/auth";
import { apiKeyCache } from "../utils/apiKeyCache";
import { getPostgresDB } from "../storage/db/postgres/db";
import { apiKeysTable } from "../storage/db/postgres/schema";
import { eq } from "drizzle-orm";
import { hashAPIKey } from "../utils/hashAPIKey";

export const no_auth: string[] = [] as const; // No endpoints bypass authentication

export function authInterceptor(): Interceptor {
  return (next) => async (req) => {
    for (const path of no_auth) {
      if (req.url.endsWith(path)) {
        return await next(req);
      }
    }

    try {
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

      // Hash the API key for lookup
      const apiKeyHash = hashAPIKey(apiKey);

      // Check cache first (using hash as key)
      const cached = apiKeyCache.get(apiKeyHash);
      if (cached) {
        req.contextValues.set(apiKeyContextKey, cached.id);
        return await next(req);
      }

      // Query database for API key by hash
      let apiKeyRecord;
      try {
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

        apiKeyRecord = result[0];
      } catch (err) {
        throw AuthError.databaseError(err instanceof Error ? err : undefined);
      }

      // Check if API key exists
      if (!apiKeyRecord) {
        throw AuthError.invalidAPIKey("API key not found");
      }

      // Check if API key is revoked
      if (apiKeyRecord.revoked) {
        throw AuthError.revokedAPIKey();
      }

      // Check if API key has expired
      const now = new Date();
      const expiresAt = new Date(apiKeyRecord.expiresAt);
      if (now > expiresAt) {
        throw AuthError.expiredAPIKey();
      }

      // Store in cache (using hash as key)
      apiKeyCache.set(apiKeyHash, {
        id: apiKeyRecord.id,
        expiresAt: apiKeyRecord.expiresAt,
      });

      // Attach API key ID to context for use in handlers
      req.contextValues.set(apiKeyContextKey, apiKeyRecord.id);
    } catch (err) {
      // Re-throw AuthError as-is, wrap other errors
      if (err instanceof AuthError || (err as any)?.type in AuthErrorType) {
        throw err;
      }
      throw AuthError.unknown(err instanceof Error ? err : undefined);
    }

    return await next(req);
  };
}
