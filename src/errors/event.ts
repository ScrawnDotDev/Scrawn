import { status } from "@grpc/grpc-js";

enum EventErrorType {
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

  // fallow-ignore-next-line unused-class-member
  static invalidPayload(details?: string, originalError?: Error): EventError {
    return new EventError({
      type: EventErrorType.INVALID_PAYLOAD,
      message: details
        ? `Invalid event payload: ${details}`
        : "Invalid event payload",
      code: status.INVALID_ARGUMENT,
      originalError,
    });
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

  // fallow-ignore-next-line unused-class-member
  static serializationError(
    details?: string,
    originalError?: Error
  ): EventError {
    return new EventError({
      type: EventErrorType.SERIALIZATION_ERROR,
      message: details
        ? `Failed to serialize event: ${details}`
        : "Failed to serialize event",
      code: status.INTERNAL,
      originalError,
    });
  }

  // fallow-ignore-next-line unused-class-member
  static invalidUserId(userId?: string, originalError?: Error): EventError {
    return new EventError({
      type: EventErrorType.INVALID_USER_ID,
      message: userId ? `Invalid user ID: ${userId}` : "Invalid user ID format",
      code: status.INVALID_ARGUMENT,
      originalError,
    });
  }

  // fallow-ignore-next-line unused-class-member
  static missingData(field: string, originalError?: Error): EventError {
    return new EventError({
      type: EventErrorType.MISSING_DATA,
      message: `Missing required event data: ${field}`,
      code: status.INVALID_ARGUMENT,
      originalError,
    });
  }

  // fallow-ignore-next-line unused-class-member
  static invalidDataFormat(
    field: string,
    expectedFormat: string,
    originalError?: Error
  ): EventError {
    return new EventError({
      type: EventErrorType.INVALID_DATA_FORMAT,
      message: `Invalid data format for ${field}. Expected ${expectedFormat}`,
      code: status.INVALID_ARGUMENT,
      originalError,
    });
  }

  // fallow-ignore-next-line unused-class-member
  static unknown(originalError?: Error): EventError {
    const details = originalError?.message || "No details available";
    return new EventError({
      type: EventErrorType.UNKNOWN,
      message: `Unexpected event processing error: ${details}`,
      code: status.INTERNAL,
      originalError,
    });
  }
}
