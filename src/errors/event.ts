import { status } from "@grpc/grpc-js";

enum EventErrorType {
  UNSUPPORTED_EVENT_TYPE = "UNSUPPORTED_EVENT_TYPE",
  VALIDATION_FAILED = "VALIDATION_FAILED",
}

export interface EventErrorContext {
  type: EventErrorType;
  message: string;
  originalError?: Error;
  code: status;
}

export class EventError extends Error {
  readonly type: EventErrorType;
  readonly originalError?: Error;
  readonly code: status;

  constructor(context: EventErrorContext) {
    super(context.message);
    this.name = "EventError";
    this.type = context.type;
    this.originalError = context.originalError;
    this.code = context.code;
  }

  static unsupportedEventType(
    eventType: string,
    originalError?: Error
  ): EventError {
    return new EventError({
      type: EventErrorType.UNSUPPORTED_EVENT_TYPE,
      message: `Unsupported event type: ${eventType}`,
      code: status.INVALID_ARGUMENT,
      originalError,
    });
  }

  static validationFailed(details: string, originalError?: Error): EventError {
    return new EventError({
      type: EventErrorType.VALIDATION_FAILED,
      message: `Event validation failed: ${details}`,
      code: status.INVALID_ARGUMENT,
      originalError,
    });
  }
}
