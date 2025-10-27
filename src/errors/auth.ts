import { Code, ConnectError } from "@connectrpc/connect";

export enum AuthErrorType {
  MISSING_HEADER = "MISSING_HEADER",
  INVALID_HEADER_FORMAT = "INVALID_HEADER_FORMAT",
  INVALID_TOKEN = "INVALID_TOKEN",
  EXPIRED_TOKEN = "EXPIRED_TOKEN",
  INVALID_PAYLOAD = "INVALID_PAYLOAD",
  SIGNING_ERROR = "SIGNING_ERROR",
  MALFORMED_PAYLOAD = "MALFORMED_PAYLOAD",
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
      message: 'Authorization header must be in format "Bearer <token>"',
      code: Code.Unauthenticated,
    });
  }

  static invalidToken(originalError?: Error): AuthError {
    return new AuthError({
      type: AuthErrorType.INVALID_TOKEN,
      message: "Invalid token",
      code: Code.Unauthenticated,
      originalError,
    });
  }

  static expiredToken(originalError?: Error): AuthError {
    return new AuthError({
      type: AuthErrorType.EXPIRED_TOKEN,
      message: "Token has expired",
      code: Code.Unauthenticated,
      originalError,
    });
  }

  static invalidPayload(details?: string): AuthError {
    return new AuthError({
      type: AuthErrorType.INVALID_PAYLOAD,
      message: details
        ? `Invalid token payload: ${details}`
        : "Invalid token payload",
      code: Code.Unauthenticated,
    });
  }

  static signingError(details?: string): AuthError {
    return new AuthError({
      type: AuthErrorType.SIGNING_ERROR,
      message: details ? `Signing Error: ${details}` : "Signing Error",
      code: Code.Unauthenticated,
    });
  }

  static malformedPayload(originalError?: Error): AuthError {
    return new AuthError({
      type: AuthErrorType.MALFORMED_PAYLOAD,
      message: "Token payload does not match expected schema",
      code: Code.Unauthenticated,
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
