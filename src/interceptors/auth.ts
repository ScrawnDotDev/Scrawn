import { type Interceptor } from "@connectrpc/connect";
import jwt, { TokenExpiredError, JsonWebTokenError } from "jsonwebtoken";
import { userContextKey } from "../context/auth";
import { type UserPayload } from "../types/auth";
import { authSchema } from "../zod/auth";
import { AuthError, AuthErrorType } from "../errors/auth";
import { logger } from "../errors/logger";

const no_auth = ["/auth.v1.AuthService/SignJWT"];

export function authInterceptor(secret: string): Interceptor {
  return (next) => async (req) => {
    for (const path of no_auth) {
      if (req.url.endsWith(path)) {
        return await next(req);
      }
    }

    try {
      let split = req.url.split("/");
      console.log(`=> ${split[split.length - 2]}/${split[split.length - 1]}`);
    } catch (e) {
      console.error("=> could not parse endpoint for logging", req.url);
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
          { endpoint: req.url },
        );
        throw error;
      }

      if (!authorization.startsWith("Bearer ")) {
        const error = AuthError.invalidHeaderFormat();
        logger.logError(
          AuthErrorType.INVALID_HEADER_FORMAT,
          error.message,
          undefined,
          { headerValue: authorization.substring(0, 20) + "..." },
        );
        throw error;
      }

      const token = authorization.slice("Bearer ".length);

      // Verify JWT signature and decode
      let decoded: unknown;
      try {
        decoded = jwt.verify(token, secret);
      } catch (err) {
        let error: AuthError;
        if (err instanceof TokenExpiredError) {
          error = AuthError.expiredToken(err);
          logger.logError(AuthErrorType.EXPIRED_TOKEN, error.message, err, {
            expiredAt: err.expiredAt?.toISOString(),
          });
        } else if (err instanceof JsonWebTokenError) {
          error = AuthError.invalidToken(err);
          logger.logError(AuthErrorType.INVALID_TOKEN, error.message, err, {
            tokenLength: token.length,
          });
        } else {
          error = AuthError.unknown(err instanceof Error ? err : undefined);
          logger.logError(
            AuthErrorType.UNKNOWN,
            error.message,
            err instanceof Error ? err : undefined,
            { endpoint: req.url },
          );
        }
        throw error;
      }

      // Validate payload structure against schema
      let payload: UserPayload;
      try {
        payload = authSchema.parse(decoded) as UserPayload;
      } catch (err) {
        const error = AuthError.malformedPayload(
          err instanceof Error ? err : undefined,
        );
        logger.logError(
          AuthErrorType.MALFORMED_PAYLOAD,
          error.message,
          err instanceof Error ? err : undefined,
          {
            decodedKeys: Object.keys(decoded as Record<string, unknown>),
            expectedKeys: ["id", "roles", "iat"],
          },
        );
        throw error;
      }

      // Attach user info to context for use in handlers
      req.contextValues.set(userContextKey, payload);
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
        { endpoint: (err as any)?.url || "unknown" },
      );
      throw error;
    }

    return await next(req);
  };
}
