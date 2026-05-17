import { status as Status } from "@grpc/grpc-js";

enum APIKeyErrorType {
  CREATION_FAILED = "CREATION_FAILED",
  VALIDATION_FAILED = "VALIDATION_FAILED",
}

export interface APIKeyErrorContext {
  type: APIKeyErrorType;
  message: string;
  originalError?: Error;
  code: number;
}

export class APIKeyError extends Error {
  readonly type: APIKeyErrorType;
  readonly originalError?: Error;
  readonly code: Status;

  constructor(context: APIKeyErrorContext) {
    super(context.message);
    this.name = "APIKeyError";
    this.type = context.type;
    this.originalError = context.originalError;
    this.code = context.code;
  }

  static creationFailed(details?: string, originalError?: Error): APIKeyError {
    return new APIKeyError({
      type: APIKeyErrorType.CREATION_FAILED,
      message: details
        ? `Failed to create API key: ${details}`
        : "Failed to create API key",
      code: Status.INTERNAL,
      originalError,
    });
  }

  static validationFailed(details: string, originalError?: Error): APIKeyError {
    return new APIKeyError({
      type: APIKeyErrorType.VALIDATION_FAILED,
      message: `API key validation failed: ${details}`,
      code: Status.INVALID_ARGUMENT,
      originalError,
    });
  }

}
