import { status } from "@grpc/grpc-js";

enum StorageErrorType {
  TRANSACTION_FAILED = "TRANSACTION_FAILED",
  INSERT_FAILED = "INSERT_FAILED",
  QUERY_FAILED = "QUERY_FAILED",
  CONSTRAINT_VIOLATION = "CONSTRAINT_VIOLATION",
  INVALID_DATA = "INVALID_DATA",
  SERIALIZATION_FAILED = "SERIALIZATION_FAILED",
  UNKNOWN_EVENT_TYPE = "UNKNOWN_EVENT_TYPE",
  MISSING_API_KEY_ID = "MISSING_API_KEY_ID",
  INVALID_TIMESTAMP = "INVALID_TIMESTAMP",
  PRICE_CALCULATION_FAILED = "PRICE_CALCULATION_FAILED",
  EMPTY_RESULT = "EMPTY_RESULT",
}

export interface StorageErrorContext {
  type: StorageErrorType;
  message: string;
  originalError?: Error;
  code: number;
}

export class StorageError extends Error {
  readonly type: StorageErrorType;
  readonly originalError?: Error;
  readonly code: number;

  constructor(context: StorageErrorContext) {
    super(context.message);
    this.name = "StorageError";
    this.type = context.type;
    this.originalError = context.originalError;
    this.code = context.code;
  }

  static transactionFailed(
    details?: string,
    originalError?: Error
  ): StorageError {
    return new StorageError({
      type: StorageErrorType.TRANSACTION_FAILED,
      message: details
        ? `Storage transaction failed: ${details}`
        : "Storage transaction failed",
      code: status.INTERNAL,
      originalError,
    });
  }

  static insertFailed(details?: string, originalError?: Error): StorageError {
    return new StorageError({
      type: StorageErrorType.INSERT_FAILED,
      message: details
        ? `Failed to insert data into storage: ${details}`
        : "Failed to insert data into storage",
      code: status.INTERNAL,
      originalError,
    });
  }

  static queryFailed(details?: string, originalError?: Error): StorageError {
    return new StorageError({
      type: StorageErrorType.QUERY_FAILED,
      message: details
        ? `Storage query failed: ${details}`
        : "Storage query failed",
      code: status.INTERNAL,
      originalError,
    });
  }

  static constraintViolation(
    constraint?: string,
    originalError?: Error
  ): StorageError {
    return new StorageError({
      type: StorageErrorType.CONSTRAINT_VIOLATION,
      message: constraint
        ? `Database constraint violation: ${constraint}`
        : "Database constraint violation",
      code: status.INVALID_ARGUMENT,
      originalError,
    });
  }

  static invalidData(details?: string, originalError?: Error): StorageError {
    return new StorageError({
      type: StorageErrorType.INVALID_DATA,
      message: details
        ? `Invalid data for storage operation: ${details}`
        : "Invalid data for storage operation",
      code: status.INVALID_ARGUMENT,
      originalError,
    });
  }

  static serializationFailed(
    details?: string,
    originalError?: Error
  ): StorageError {
    return new StorageError({
      type: StorageErrorType.SERIALIZATION_FAILED,
      message: details
        ? `Failed to serialize data for storage: ${details}`
        : "Failed to serialize data for storage",
      code: status.INTERNAL,
      originalError,
    });
  }

  static unknownEventType(
    eventType: string,
    originalError?: Error
  ): StorageError {
    return new StorageError({
      type: StorageErrorType.UNKNOWN_EVENT_TYPE,
      message: `No storage logic implemented for event type: ${eventType}`,
      code: status.INVALID_ARGUMENT,
      originalError,
    });
  }

  static missingApiKeyId(originalError?: Error): StorageError {
    return new StorageError({
      type: StorageErrorType.MISSING_API_KEY_ID,
      message: "API key ID is required for event storage",
      code: status.INVALID_ARGUMENT,
      originalError,
    });
  }

  static invalidTimestamp(
    details?: string,
    originalError?: Error
  ): StorageError {
    return new StorageError({
      type: StorageErrorType.INVALID_TIMESTAMP,
      message: details
        ? `Invalid timestamp: ${details}`
        : "Invalid or missing timestamp",
      code: status.INVALID_ARGUMENT,
      originalError,
    });
  }

  static priceCalculationFailed(
    userId?: string,
    originalError?: Error
  ): StorageError {
    return new StorageError({
      type: StorageErrorType.PRICE_CALCULATION_FAILED,
      message: userId
        ? `Failed to calculate price for user: ${userId}`
        : "Failed to calculate price",
      code: status.INTERNAL,
      originalError,
    });
  }

  static emptyResult(entity?: string, originalError?: Error): StorageError {
    return new StorageError({
      type: StorageErrorType.EMPTY_RESULT,
      message: entity
        ? `Query returned empty result for: ${entity}`
        : "Query returned empty result",
      code: status.NOT_FOUND,
      originalError,
    });
  }

}
