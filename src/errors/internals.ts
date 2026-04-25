import { Code, ConnectError } from "@connectrpc/connect";

export enum InternalsErrorType {
  INVALID_CRON = "INVALID_CRON",
  QUEUE_CREATION_FAILED = "QUEUE_CREATION_FAILED",
  VALIDATION_FAILED = "VALIDATION_FAILED",
  UNKNOWN = "UNKNOWN",
}

export interface InternalsErrorContext {
  type: InternalsErrorType;
  message: string;
  originalError?: Error;
  code: Code;
}

export class InternalsError extends ConnectError {
  readonly type: InternalsErrorType;
  readonly originalError?: Error;

  constructor(context: InternalsErrorContext) {
    super(context.message, context.code);
    this.name = "InternalsError";
    this.type = context.type;
    this.originalError = context.originalError;

    Object.setPrototypeOf(this, InternalsError.prototype);
  }

  static invalidCron(details?: string, originalError?: Error): InternalsError {
    return new InternalsError({
      type: InternalsErrorType.INVALID_CRON,
      message: details
        ? `Invalid cron expression: ${details}`
        : "Invalid cron expression",
      code: Code.InvalidArgument,
      originalError,
    });
  }

  static queueCreationFailed(
    details?: string,
    originalError?: Error
  ): InternalsError {
    return new InternalsError({
      type: InternalsErrorType.QUEUE_CREATION_FAILED,
      message: details
        ? `Failed to create queue: ${details}`
        : "Failed to create queue",
      code: Code.Internal,
      originalError,
    });
  }

  static validationFailed(details: string, originalError?: Error): InternalsError {
    return new InternalsError({
      type: InternalsErrorType.VALIDATION_FAILED,
      message: `Internals validation failed: ${details}`,
      code: Code.InvalidArgument,
      originalError,
    });
  }

  static unknown(originalError?: Error): InternalsError {
    const details = originalError?.message || "No details available";
    return new InternalsError({
      type: InternalsErrorType.UNKNOWN,
      message: `Unexpected internals error: ${details}`,
      code: Code.Internal,
      originalError,
    });
  }
}