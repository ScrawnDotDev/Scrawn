import { DateTime } from "luxon";
import { vi } from "vitest";

/**
 * Creates a mock Drizzle transaction object with chainable query builder methods
 * Useful for testing database operations without a real database
 */
export const createMockTransaction = () => {
  const insertMock = vi.fn().mockReturnThis();
  const valuesMock = vi.fn().mockReturnThis();
  const returningMock = vi.fn();

  return {
    insert: insertMock,
    values: valuesMock,
    returning: returningMock,
    insertMock,
    valuesMock,
    returningMock,
  };
};

/**
 * Creates a mock event data object for ServerlessFunctionCallEvent
 * Simulates the serialized POSTGRES format
 */
export const createMockServerlessFunctionCallEventData = (overrides?: {
  userId?: string;
  debitAmount?: number;
  timestamp?: DateTime;
}) => {
  const timestamp = overrides?.timestamp || DateTime.utc();

  return {
    type: "SERVERLESS_FUNCTION_CALL" as const,
    userId: overrides?.userId || "test-user-123",
    reported_timestamp: timestamp,
    data: {
      debitAmount: overrides?.debitAmount !== undefined ? overrides.debitAmount : 100,
    },
  };
};

/**
 * Creates a mock database connection object
 * Simulates a Drizzle ORM instance with transaction support
 */
export const createMockDatabaseConnection = (
  transactionImplementation?: (
    callback: (txn: any) => Promise<void>,
  ) => Promise<void>,
) => {
  return {
    transaction: vi.fn(transactionImplementation || (async (cb) => cb({}))),
    query: vi.fn(),
  };
};

/**
 * Helper to create a successful insertion result with a generated ID
 */
export const createInsertionResult = (id: string = "generated-uuid") => {
  return [{ id }];
};

/**
 * Helper to simulate a PostgreSQL duplicate key error
 */
export const createDuplicateKeyError = () => {
  return new Error("duplicate key value violates unique constraint");
};

/**
 * Helper to simulate a PostgreSQL foreign key error
 */
export const createForeignKeyError = () => {
  return new Error("foreign key constraint violation");
};

/**
 * Helper to simulate a PostgreSQL not-null constraint error
 */
export const createNotNullViolationError = (column: string = "debitAmount") => {
  return new Error(`not-null constraint violation on column ${column}`);
};

/**
 * Helper to simulate a PostgreSQL connection error
 */
export const createConnectionError = (type: "refused" | "notfound" = "refused") => {
  if (type === "refused") {
    return new Error("ECONNREFUSED: Connection refused");
  }
  return new Error("ENOTFOUND: getaddrinfo failed");
};

/**
 * Helper to simulate a timestamp conversion error
 */
export const createTimestampConversionError = () => {
  return new Error("Failed to convert timestamp to SQL format");
};
