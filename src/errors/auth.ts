import { status as Status } from "@grpc/grpc-js";

enum AuthErrorType {
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
  code: Status;
}

export class AuthError extends Error {
  readonly type: AuthErrorType;
  readonly originalError?: Error;
  readonly code: Status;

  constructor(context: AuthErrorContext) {
    super(context.message);
    this.name = "AuthError";
    this.type = context.type;
    this.originalError = context.originalError;
    this.code = context.code;
  }

  static missingHeader(): AuthError {
    return new AuthError({
      type: AuthErrorType.MISSING_HEADER,
      message: "Missing Authorization header",
      code: Status.UNAUTHENTICATED,
    });
  }

  static invalidHeaderFormat(): AuthError {
    return new AuthError({
      type: AuthErrorType.INVALID_HEADER_FORMAT,
      message: 'Authorization header must be in format "Bearer <api_key>"',
      code: Status.UNAUTHENTICATED,
    });
  }

  static invalidAPIKey(details?: string): AuthError {
    return new AuthError({
      type: AuthErrorType.INVALID_API_KEY,
      message: details ? `Invalid API key: ${details}` : "Invalid API key",
      code: Status.UNAUTHENTICATED,
    });
  }

  static expiredAPIKey(): AuthError {
    return new AuthError({
      type: AuthErrorType.EXPIRED_API_KEY,
      message: "API key has expired",
      code: Status.UNAUTHENTICATED,
    });
  }

  static revokedAPIKey(): AuthError {
    return new AuthError({
      type: AuthErrorType.REVOKED_API_KEY,
      message: "API key has been revoked",
      code: Status.UNAUTHENTICATED,
    });
  }

  // fallow-ignore-next-line unused-class-member
  static databaseError(originalError?: Error): AuthError {
    return new AuthError({
      type: AuthErrorType.DATABASE_ERROR,
      message: "Failed to verify API key",
      code: Status.INTERNAL,
      originalError,
    });
  }

  // fallow-ignore-next-line unused-class-member
  static unknown(originalError?: Error): AuthError {
    const details = originalError?.message || "No details available";
    return new AuthError({
      type: AuthErrorType.UNKNOWN,
      message: `Unexpected authentication error: ${details}`,
      code: Status.INTERNAL,
      originalError,
    });
  }
}
