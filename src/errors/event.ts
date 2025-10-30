import { Code, ConnectError } from "@connectrpc/connect";

export enum EventErrorType {
  INVALID_PAYLOAD = "INVALID_PAYLOAD",
  UNSUPPORTED_EVENT_TYPE = "UNSUPPORTED_EVENT_TYPE",
  VALIDATION_FAILED = "VALIDATION_FAILED",
  SERIALIZATION_ERROR = "SERIALIZATION_ERROR",
  INVALID_USER_ID = "INVALID_USER_ID",
  MISSING_DATA = "MISSING_DATA",
  INVALID_DATA_FORMAT = "INVALID_DATA_FORMAT",
  UNKNOWN = "UNKNOWN",
}

export interface EventErrorContext {
  type: EventErrorType;
  message: string;
  originalError?: Error;
  code: Code;
}

export class EventError extends ConnectError {
  readonly type: EventErrorType;
  readonly originalError?: Error;

  constructor(context: EventErrorContext) {
    super(context.message, context.code);
    this.name = "EventError";
    this.type = context.type;
    this.originalError = context.originalError;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, EventError.prototype);
  }

  static invalidPayload(details?: string, originalError?: Error): EventError {
    return new EventError({
      type: EventErrorType.INVALID_PAYLOAD,
      message: details
        ? `Invalid event payload: ${details}`
        : "Invalid event payload",
      code: Code.InvalidArgument,
      originalError,
    });
  }

  static unsupportedEventType(
    eventType: string,
    originalError?: Error,
  ): EventError {
    return new EventError({
      type: EventErrorType.UNSUPPORTED_EVENT_TYPE,
      message: `Unsupported event type: ${eventType}`,
      code: Code.InvalidArgument,
      originalError,
    });
  }

  static validationFailed(details: string, originalError?: Error): EventError {
    return new EventError({
      type: EventErrorType.VALIDATION_FAILED,
      message: `Event validation failed: ${details}`,
      code: Code.InvalidArgument,
      originalError,
    });
  }

  static serializationError(
    details?: string,
    originalError?: Error,
  ): EventError {
    return new EventError({
      type: EventErrorType.SERIALIZATION_ERROR,
      message: details
        ? `Failed to serialize event: ${details}`
        : "Failed to serialize event",
      code: Code.Internal,
      originalError,
    });
  }

  static invalidUserId(userId?: string, originalError?: Error): EventError {
    return new EventError({
      type: EventErrorType.INVALID_USER_ID,
      message: userId ? `Invalid user ID: ${userId}` : "Invalid user ID format",
      code: Code.InvalidArgument,
      originalError,
    });
  }

  static missingData(field: string, originalError?: Error): EventError {
    return new EventError({
      type: EventErrorType.MISSING_DATA,
      message: `Missing required event data: ${field}`,
      code: Code.InvalidArgument,
      originalError,
    });
  }

  static invalidDataFormat(
    field: string,
    expectedFormat: string,
    originalError?: Error,
  ): EventError {
    return new EventError({
      type: EventErrorType.INVALID_DATA_FORMAT,
      message: `Invalid data format for ${field}. Expected ${expectedFormat}`,
      code: Code.InvalidArgument,
      originalError,
    });
  }

  static unknown(originalError?: Error): EventError {
    return new EventError({
      type: EventErrorType.UNKNOWN,
      message: "An unknown event processing error occurred",
      code: Code.Internal,
      originalError,
    });
  }
}
