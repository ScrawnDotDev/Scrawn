import { Code, ConnectError } from "@connectrpc/connect";

export enum StorageErrorType {
  CONNECTION_FAILED = "CONNECTION_FAILED",
  TRANSACTION_FAILED = "TRANSACTION_FAILED",
  INSERT_FAILED = "INSERT_FAILED",
  QUERY_FAILED = "QUERY_FAILED",
  CONSTRAINT_VIOLATION = "CONSTRAINT_VIOLATION",
  DATA_NOT_FOUND = "DATA_NOT_FOUND",
  INVALID_DATA = "INVALID_DATA",
  SERIALIZATION_FAILED = "SERIALIZATION_FAILED",
  UNKNOWN_EVENT_TYPE = "UNKNOWN_EVENT_TYPE",
  MISSING_API_KEY_ID = "MISSING_API_KEY_ID",
  INVALID_TIMESTAMP = "INVALID_TIMESTAMP",
  USER_INSERT_FAILED = "USER_INSERT_FAILED",
  EVENT_INSERT_FAILED = "EVENT_INSERT_FAILED",
  PRICE_CALCULATION_FAILED = "PRICE_CALCULATION_FAILED",
  EMPTY_RESULT = "EMPTY_RESULT",
  UNKNOWN = "UNKNOWN",
}

export interface StorageErrorContext {
  type: StorageErrorType;
  message: string;
  originalError?: Error;
  code: Code;
}

export class StorageError extends ConnectError {
  readonly type: StorageErrorType;
  readonly originalError?: Error;

  constructor(context: StorageErrorContext) {
    super(context.message, context.code);
    this.name = "StorageError";
    this.type = context.type;
    this.originalError = context.originalError;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, StorageError.prototype);
  }

  static connectionFailed(
    details?: string,
    originalError?: Error
  ): StorageError {
    return new StorageError({
      type: StorageErrorType.CONNECTION_FAILED,
      message: details
        ? `Storage connection failed: ${details}`
        : "Storage connection failed",
      code: Code.Internal,
      originalError,
    });
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
      code: Code.Internal,
      originalError,
    });
  }

  static insertFailed(details?: string, originalError?: Error): StorageError {
    return new StorageError({
      type: StorageErrorType.INSERT_FAILED,
      message: details
        ? `Failed to insert data into storage: ${details}`
        : "Failed to insert data into storage",
      code: Code.Internal,
      originalError,
    });
  }

  static queryFailed(details?: string, originalError?: Error): StorageError {
    return new StorageError({
      type: StorageErrorType.QUERY_FAILED,
      message: details
        ? `Storage query failed: ${details}`
        : "Storage query failed",
      code: Code.Internal,
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
      code: Code.InvalidArgument,
      originalError,
    });
  }

  static dataNotFound(entity?: string, originalError?: Error): StorageError {
    return new StorageError({
      type: StorageErrorType.DATA_NOT_FOUND,
      message: entity
        ? `${entity} not found in storage`
        : "Data not found in storage",
      code: Code.NotFound,
      originalError,
    });
  }

  static invalidData(details?: string, originalError?: Error): StorageError {
    return new StorageError({
      type: StorageErrorType.INVALID_DATA,
      message: details
        ? `Invalid data for storage operation: ${details}`
        : "Invalid data for storage operation",
      code: Code.InvalidArgument,
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
      code: Code.Internal,
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
      code: Code.InvalidArgument,
      originalError,
    });
  }

  static missingApiKeyId(originalError?: Error): StorageError {
    return new StorageError({
      type: StorageErrorType.MISSING_API_KEY_ID,
      message: "API key ID is required for event storage",
      code: Code.InvalidArgument,
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
      code: Code.InvalidArgument,
      originalError,
    });
  }

  static userInsertFailed(
    userId?: string,
    originalError?: Error
  ): StorageError {
    return new StorageError({
      type: StorageErrorType.USER_INSERT_FAILED,
      message: userId
        ? `Failed to insert user with ID: ${userId}`
        : "Failed to insert user",
      code: Code.Internal,
      originalError,
    });
  }

  static eventInsertFailed(
    details?: string,
    originalError?: Error
  ): StorageError {
    return new StorageError({
      type: StorageErrorType.EVENT_INSERT_FAILED,
      message: details
        ? `Failed to insert event: ${details}`
        : "Failed to insert event",
      code: Code.Internal,
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
      code: Code.Internal,
      originalError,
    });
  }

  static emptyResult(entity?: string, originalError?: Error): StorageError {
    return new StorageError({
      type: StorageErrorType.EMPTY_RESULT,
      message: entity
        ? `Query returned empty result for: ${entity}`
        : "Query returned empty result",
      code: Code.NotFound,
      originalError,
    });
  }

  static unknown(originalError?: Error): StorageError {
    return new StorageError({
      type: StorageErrorType.UNKNOWN,
      message: "An unknown storage error occurred",
      code: Code.Internal,
      originalError,
    });
  }
}
