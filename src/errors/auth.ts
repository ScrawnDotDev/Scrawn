import { Code, ConnectError } from "@connectrpc/connect";

export enum AuthErrorType {
  MISSING_HEADER = "MISSING_HEADER",
  INVALID_HEADER_FORMAT = "INVALID_HEADER_FORMAT",
  INVALID_API_KEY = "INVALID_API_KEY",
  EXPIRED_API_KEY = "EXPIRED_API_KEY",
  REVOKED_API_KEY = "REVOKED_API_KEY",
  DATABASE_ERROR = "DATABASE_ERROR",
  UNKNOWN = "UNKNOWN",
}

export interface AuthErrorContext {
  type: AuthErrorType;
  message: string;
  originalError?: Error;
  code: Code;
}

export class AuthError extends ConnectError {
  readonly type: AuthErrorType;
  readonly originalError?: Error;

  constructor(context: AuthErrorContext) {
    super(context.message, context.code);
    this.name = "AuthError";
    this.type = context.type;
    this.originalError = context.originalError;

    // Fix prototype chain for instanceof checks
    // Must set AuthError.prototype after ConnectError constructor
    if (Object.getPrototypeOf(this) !== AuthError.prototype) {
      Object.setPrototypeOf(this, AuthError.prototype);
    }
  }

  static missingHeader(): AuthError {
    return new AuthError({
      type: AuthErrorType.MISSING_HEADER,
      message: "Missing Authorization header",
      code: Code.Unauthenticated,
    });
  }

  static invalidHeaderFormat(): AuthError {
    return new AuthError({
      type: AuthErrorType.INVALID_HEADER_FORMAT,
      message: 'Authorization header must be in format "Bearer <api_key>"',
      code: Code.Unauthenticated,
    });
  }

  static invalidAPIKey(details?: string): AuthError {
    return new AuthError({
      type: AuthErrorType.INVALID_API_KEY,
      message: details ? `Invalid API key: ${details}` : "Invalid API key",
      code: Code.Unauthenticated,
    });
  }

  static expiredAPIKey(): AuthError {
    return new AuthError({
      type: AuthErrorType.EXPIRED_API_KEY,
      message: "API key has expired",
      code: Code.Unauthenticated,
    });
  }

  static revokedAPIKey(): AuthError {
    return new AuthError({
      type: AuthErrorType.REVOKED_API_KEY,
      message: "API key has been revoked",
      code: Code.Unauthenticated,
    });
  }

  static databaseError(originalError?: Error): AuthError {
    return new AuthError({
      type: AuthErrorType.DATABASE_ERROR,
      message: "Failed to verify API key",
      code: Code.Internal,
      originalError,
    });
  }

  static unknown(originalError?: Error): AuthError {
    return new AuthError({
      type: AuthErrorType.UNKNOWN,
      message: "An unknown authentication error occurred",
      code: Code.Internal,
      originalError,
    });
  }
}
