import { Code, ConnectError } from "@connectrpc/connect";

export enum APIKeyErrorType {
  INVALID_EXPIRATION = "INVALID_EXPIRATION",
  INVALID_NAME = "INVALID_NAME",
  CREATION_FAILED = "CREATION_FAILED",
  NOT_FOUND = "NOT_FOUND",
  REVOCATION_FAILED = "REVOCATION_FAILED",
  VALIDATION_FAILED = "VALIDATION_FAILED",
  UNKNOWN = "UNKNOWN",
}

export interface APIKeyErrorContext {
  type: APIKeyErrorType;
  message: string;
  originalError?: Error;
  code: Code;
}

export class APIKeyError extends ConnectError {
  readonly type: APIKeyErrorType;
  readonly originalError?: Error;

  constructor(context: APIKeyErrorContext) {
    super(context.message, context.code);
    this.name = "APIKeyError";
    this.type = context.type;
    this.originalError = context.originalError;

    Object.setPrototypeOf(this, APIKeyError.prototype);
  }

  static invalidExpiration(
    details?: string,
    originalError?: Error
  ): APIKeyError {
    return new APIKeyError({
      type: APIKeyErrorType.INVALID_EXPIRATION,
      message: details
        ? `Invalid expiration: ${details}`
        : "Invalid expiration time",
      code: Code.InvalidArgument,
      originalError,
    });
  }

  static invalidName(details?: string, originalError?: Error): APIKeyError {
    return new APIKeyError({
      type: APIKeyErrorType.INVALID_NAME,
      message: details ? `Invalid name: ${details}` : "Invalid API key name",
      code: Code.InvalidArgument,
      originalError,
    });
  }

  static creationFailed(details?: string, originalError?: Error): APIKeyError {
    return new APIKeyError({
      type: APIKeyErrorType.CREATION_FAILED,
      message: details
        ? `Failed to create API key: ${details}`
        : "Failed to create API key",
      code: Code.Internal,
      originalError,
    });
  }

  static notFound(apiKeyId?: string, originalError?: Error): APIKeyError {
    return new APIKeyError({
      type: APIKeyErrorType.NOT_FOUND,
      message: apiKeyId
        ? `API key not found: ${apiKeyId}`
        : "API key not found",
      code: Code.NotFound,
      originalError,
    });
  }

  static revocationFailed(
    details?: string,
    originalError?: Error
  ): APIKeyError {
    return new APIKeyError({
      type: APIKeyErrorType.REVOCATION_FAILED,
      message: details
        ? `Failed to revoke API key: ${details}`
        : "Failed to revoke API key",
      code: Code.Internal,
      originalError,
    });
  }

  static validationFailed(details: string, originalError?: Error): APIKeyError {
    return new APIKeyError({
      type: APIKeyErrorType.VALIDATION_FAILED,
      message: `API key validation failed: ${details}`,
      code: Code.InvalidArgument,
      originalError,
    });
  }

  static unknown(originalError?: Error): APIKeyError {
    return new APIKeyError({
      type: APIKeyErrorType.UNKNOWN,
      message: "An unknown API key processing error occurred",
      code: Code.Internal,
      originalError,
    });
  }
}
