import { type Interceptor } from "@connectrpc/connect";
import { apiKeyContextKey } from "../context/auth";
import { AuthError, AuthErrorType } from "../errors/auth";
import { logger } from "../errors/logger";
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

    // Extract endpoint for context
    let endpoint = req.url;
    try {
      const split = req.url.split("/");
      endpoint = `${split[split.length - 2]}/${split[split.length - 1]}`;
      logger.logDebug(`Processing request to ${endpoint}`, {
        endpoint: req.url,
      });
    } catch (e) {
      logger.logDebug("Could not parse endpoint for logging", { url: req.url });
    }

    try {
      // Extract and validate authorization header
      const authorization = req.header.get("Authorization");
      if (!authorization) {
        const error = AuthError.missingHeader();
        logger.logError(
          AuthErrorType.MISSING_HEADER,
          error.message,
          undefined,
          { endpoint: req.url }
        );
        throw error;
      }

      if (!authorization.startsWith("Bearer ")) {
        const error = AuthError.invalidHeaderFormat();
        logger.logError(
          AuthErrorType.INVALID_HEADER_FORMAT,
          error.message,
          undefined,
          { headerValue: authorization.substring(0, 20) + "..." }
        );
        throw error;
      }

      const apiKey = authorization.slice("Bearer ".length).trim();

      // Validate API key format
      if (!apiKey.startsWith("scrn_") || apiKey.length !== 37) {
        const error = AuthError.invalidAPIKey("Invalid API key format");
        logger.logError(
          AuthErrorType.INVALID_API_KEY,
          error.message,
          undefined,
          { endpoint: req.url }
        );
        throw error;
      }

      // Hash the API key for lookup
      const apiKeyHash = hashAPIKey(apiKey);

      // Check cache first (using hash as key)
      const cached = apiKeyCache.get(apiKeyHash);
      if (cached) {
        logger.logDebug("Cache hit for API key", { apiKeyId: cached.id });
        req.contextValues.set(apiKeyContextKey, cached.id);
        return await next(req);
      }

      logger.logDebug("Cache miss, querying database", {});

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
        const error = AuthError.databaseError(
          err instanceof Error ? err : undefined
        );
        logger.logError(
          AuthErrorType.DATABASE_ERROR,
          error.message,
          err instanceof Error ? err : undefined,
          { endpoint: req.url }
        );
        throw error;
      }

      // Check if API key exists
      if (!apiKeyRecord) {
        const error = AuthError.invalidAPIKey("API key not found");
        logger.logError(
          AuthErrorType.INVALID_API_KEY,
          error.message,
          undefined,
          { endpoint: req.url }
        );
        throw error;
      }

      // Check if API key is revoked
      if (apiKeyRecord.revoked) {
        const error = AuthError.revokedAPIKey();
        logger.logError(
          AuthErrorType.REVOKED_API_KEY,
          error.message,
          undefined,
          { apiKeyId: apiKeyRecord.id }
        );
        throw error;
      }

      // Check if API key has expired
      const now = new Date();
      const expiresAt = new Date(apiKeyRecord.expiresAt);
      if (now > expiresAt) {
        const error = AuthError.expiredAPIKey();
        logger.logError(
          AuthErrorType.EXPIRED_API_KEY,
          error.message,
          undefined,
          {
            apiKeyId: apiKeyRecord.id,
            expiresAt: apiKeyRecord.expiresAt,
          }
        );
        throw error;
      }

      // Store in cache (using hash as key)
      apiKeyCache.set(apiKeyHash, {
        id: apiKeyRecord.id,
        expiresAt: apiKeyRecord.expiresAt,
      });

      logger.logDebug("Valid API key from database", {
        apiKeyId: apiKeyRecord.id,
      });

      // Attach API key ID to context for use in handlers
      req.contextValues.set(apiKeyContextKey, apiKeyRecord.id);
    } catch (err) {
      // Re-throw AuthError as-is, wrap other errors
      if (err instanceof AuthError || (err as any)?.type in AuthErrorType) {
        throw err;
      }
      const error = AuthError.unknown(err instanceof Error ? err : undefined);
      logger.logError(
        AuthErrorType.UNKNOWN,
        error.message,
        err instanceof Error ? err : undefined,
        { endpoint: req.url }
      );
      throw error;
    }

    return await next(req);
  };
}
