import { Code, ConnectError } from "@connectrpc/connect";

export enum PostgresStorageErrorType {
  CONNECTION_FAILED = "CONNECTION_FAILED",
  TRANSACTION_FAILED = "TRANSACTION_FAILED",
  DUPLICATE_KEY = "DUPLICATE_KEY",
  FOREIGN_KEY_VIOLATION = "FOREIGN_KEY_VIOLATION",
  UNIQUE_VIOLATION = "UNIQUE_VIOLATION",
  NOT_NULL_VIOLATION = "NOT_NULL_VIOLATION",
  CHECK_VIOLATION = "CHECK_VIOLATION",
  INVALID_DATA_TYPE = "INVALID_DATA_TYPE",
  QUERY_TIMEOUT = "QUERY_TIMEOUT",
  CONNECTION_TIMEOUT = "CONNECTION_TIMEOUT",
  SERIALIZATION_FAILED = "SERIALIZATION_FAILED",
  INVALID_TIMESTAMP = "INVALID_TIMESTAMP",
  QUERY_FAILED = "QUERY_FAILED",
  UNKNOWN = "UNKNOWN",
}

export interface PostgresStorageErrorContext {
  type: PostgresStorageErrorType;
  message: string;
  originalError?: Error;
  code: Code;
}

export class PostgresStorageError extends ConnectError {
  readonly type: PostgresStorageErrorType;
  readonly originalError?: Error;

  constructor(context: PostgresStorageErrorContext) {
    super(context.message, context.code);
    this.name = "PostgresStorageError";
    this.type = context.type;
    this.originalError = context.originalError;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, PostgresStorageError.prototype);
  }

  static connectionFailed(
    details?: string,
    originalError?: Error,
  ): PostgresStorageError {
    return new PostgresStorageError({
      type: PostgresStorageErrorType.CONNECTION_FAILED,
      message: details
        ? `PostgreSQL connection failed: ${details}`
        : "PostgreSQL connection failed",
      code: Code.Internal,
      originalError,
    });
  }

  static transactionFailed(
    details?: string,
    originalError?: Error,
  ): PostgresStorageError {
    return new PostgresStorageError({
      type: PostgresStorageErrorType.TRANSACTION_FAILED,
      message: details
        ? `PostgreSQL transaction failed: ${details}`
        : "PostgreSQL transaction failed",
      code: Code.Internal,
      originalError,
    });
  }

  static duplicateKey(
    details?: string,
    originalError?: Error,
  ): PostgresStorageError {
    return new PostgresStorageError({
      type: PostgresStorageErrorType.DUPLICATE_KEY,
      message: details
        ? `Duplicate key error: ${details}`
        : "Duplicate key error",
      code: Code.InvalidArgument,
      originalError,
    });
  }

  static foreignKeyViolation(
    details?: string,
    originalError?: Error,
  ): PostgresStorageError {
    return new PostgresStorageError({
      type: PostgresStorageErrorType.FOREIGN_KEY_VIOLATION,
      message: details
        ? `Foreign key constraint violation: ${details}`
        : "Foreign key constraint violation",
      code: Code.InvalidArgument,
      originalError,
    });
  }

  static uniqueViolation(
    details?: string,
    originalError?: Error,
  ): PostgresStorageError {
    return new PostgresStorageError({
      type: PostgresStorageErrorType.UNIQUE_VIOLATION,
      message: details
        ? `Unique constraint violation: ${details}`
        : "Unique constraint violation",
      code: Code.InvalidArgument,
      originalError,
    });
  }

  static notNullViolation(
    column?: string,
    originalError?: Error,
  ): PostgresStorageError {
    return new PostgresStorageError({
      type: PostgresStorageErrorType.NOT_NULL_VIOLATION,
      message: column
        ? `Not null constraint violation on column: ${column}`
        : "Not null constraint violation",
      code: Code.InvalidArgument,
      originalError,
    });
  }

  static checkViolation(
    details?: string,
    originalError?: Error,
  ): PostgresStorageError {
    return new PostgresStorageError({
      type: PostgresStorageErrorType.CHECK_VIOLATION,
      message: details
        ? `Check constraint violation: ${details}`
        : "Check constraint violation",
      code: Code.InvalidArgument,
      originalError,
    });
  }

  static invalidDataType(
    details?: string,
    originalError?: Error,
  ): PostgresStorageError {
    return new PostgresStorageError({
      type: PostgresStorageErrorType.INVALID_DATA_TYPE,
      message: details ? `Invalid data type: ${details}` : "Invalid data type",
      code: Code.InvalidArgument,
      originalError,
    });
  }

  static queryTimeout(
    details?: string,
    originalError?: Error,
  ): PostgresStorageError {
    return new PostgresStorageError({
      type: PostgresStorageErrorType.QUERY_TIMEOUT,
      message: details
        ? `Query timeout: ${details}`
        : "Query execution timed out",
      code: Code.Internal,
      originalError,
    });
  }

  static connectionTimeout(
    details?: string,
    originalError?: Error,
  ): PostgresStorageError {
    return new PostgresStorageError({
      type: PostgresStorageErrorType.CONNECTION_TIMEOUT,
      message: details
        ? `Connection timeout: ${details}`
        : "Connection to PostgreSQL timed out",
      code: Code.Internal,
      originalError,
    });
  }

  static serializationFailed(
    details?: string,
    originalError?: Error,
  ): PostgresStorageError {
    return new PostgresStorageError({
      type: PostgresStorageErrorType.SERIALIZATION_FAILED,
      message: details
        ? `Failed to serialize data for PostgreSQL: ${details}`
        : "Failed to serialize data for PostgreSQL",
      code: Code.Internal,
      originalError,
    });
  }

  static invalidTimestamp(
    details?: string,
    originalError?: Error,
  ): PostgresStorageError {
    return new PostgresStorageError({
      type: PostgresStorageErrorType.INVALID_TIMESTAMP,
      message: details
        ? `Invalid timestamp: ${details}`
        : "Invalid timestamp format",
      code: Code.InvalidArgument,
      originalError,
    });
  }

  static queryFailed(
    details?: string,
    originalError?: Error,
  ): PostgresStorageError {
    return new PostgresStorageError({
      type: PostgresStorageErrorType.QUERY_FAILED,
      message: details ? `Query failed: ${details}` : "Query execution failed",
      code: Code.Internal,
      originalError,
    });
  }

  static unknown(originalError?: Error): PostgresStorageError {
    return new PostgresStorageError({
      type: PostgresStorageErrorType.UNKNOWN,
      message: "An unknown PostgreSQL storage error occurred",
      code: Code.Internal,
      originalError,
    });
  }

  /**
   * Helper method to parse PostgreSQL errors and return appropriate PostgresStorageError
   * Analyzes error messages to determine the specific error type and returns
   * the most appropriate error variant.
   * @param error The original error from PostgreSQL
   * @returns Appropriate PostgresStorageError
   */
  static fromPostgresError(error: Error): PostgresStorageError {
    const message = error.message || "";

    // Check for duplicate key error
    if (message.includes("duplicate key value")) {
      return PostgresStorageError.duplicateKey(message, error);
    }

    // Check for unique constraint violation (23505)
    if (message.includes("unique constraint")) {
      return PostgresStorageError.uniqueViolation(message, error);
    }

    // Check for foreign key violation (23503)
    if (message.includes("foreign key constraint")) {
      return PostgresStorageError.foreignKeyViolation(message, error);
    }

    // Check for not null violation (23502)
    if (
      message.includes("not-null constraint") ||
      message.includes("not null")
    ) {
      return PostgresStorageError.notNullViolation(undefined, error);
    }

    // Check for check constraint violation (23514)
    if (message.includes("check constraint")) {
      return PostgresStorageError.checkViolation(message, error);
    }

    // Check for timeout
    if (message.includes("timeout") || message.includes("Timeout")) {
      return PostgresStorageError.queryTimeout(message, error);
    }

    // Check for connection errors
    if (
      message.includes("connection") ||
      message.includes("Connection") ||
      message.includes("ECONNREFUSED") ||
      message.includes("ENOTFOUND")
    ) {
      return PostgresStorageError.connectionFailed(message, error);
    }

    // Check for pool exhausted
    if (message.includes("pool") || message.includes("Pool")) {
      return PostgresStorageError.connectionFailed(
        "Connection pool exhausted",
        error,
      );
    }

    // Check for invalid data type
    if (
      message.includes("invalid input syntax") ||
      message.includes("invalid type")
    ) {
      return PostgresStorageError.invalidDataType(message, error);
    }

    // Default to query failed if it mentions a query
    if (
      message.includes("query") ||
      message.includes("Query") ||
      message.includes("SQL")
    ) {
      return PostgresStorageError.queryFailed(message, error);
    }

    // Default to unknown
    return PostgresStorageError.unknown(error);
  }
}
