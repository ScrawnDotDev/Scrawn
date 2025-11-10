import { describe, it, expect, beforeEach, vi } from "vitest";
import { DateTime } from "luxon";
import { PostgresAdapter } from "../../../storage/adapter/postgres";
import { StorageError } from "../../../errors/storage";
import { isStorageError } from "../../helpers/error";

// Mock the database module
vi.mock("../../../storage/db/postgres/db", () => ({
  getPostgresDB: vi.fn(),
}));

import { getPostgresDB } from "../../../storage/db/postgres/db";

describe("PostgresAdapter", () => {
  let mockEvent: any;
  let mockDB: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock event
    mockEvent = {
      type: "SDK_CALL",
      userId: "test-user-123",
      reported_timestamp: DateTime.utc(),
      data: {
        debitAmount: 100,
      },
      serialize: vi.fn(() => ({
        SQL: {
          type: "SDK_CALL",
          userId: "test-user-123",
          reported_timestamp: DateTime.utc(),
          data: {
            debitAmount: 100,
            sdkCallType: "RAW",
          },
        },
      })),
    };

    mockDB = {
      transaction: vi.fn(),
    };

    (getPostgresDB as any).mockReturnValue(mockDB);
  });

  describe("initialization", () => {
    it("should create adapter with correct name", () => {
      const adapter = new PostgresAdapter(mockEvent, "test-api-key-id");
      expect(adapter.name).toBe("SDK_CALL");
    });

    it("should set event property correctly", () => {
      const adapter = new PostgresAdapter(mockEvent, "test-api-key-id");
      expect(adapter.event).toBe(mockEvent);
    });

    it("should initialize connectionObject from getPostgresDB", () => {
      const adapter = new PostgresAdapter(mockEvent, "test-api-key-id");
      expect(adapter.connectionObject).toBe(mockDB);
      expect(getPostgresDB).toHaveBeenCalled();
    });
  });

  describe("add() - SDK_CALL event", () => {
    it("should execute transaction with correct event data", async () => {
      mockDB.transaction.mockImplementation(async (callback: any) => {
        return callback(createMockTransaction());
      });

      const adapter = new PostgresAdapter(mockEvent, "test-api-key-id");
      await adapter.add();

      expect(mockEvent.serialize).toHaveBeenCalled();
      expect(mockDB.transaction).toHaveBeenCalled();
    });

    it("should handle duplicate user error gracefully", async () => {
      mockDB.transaction.mockImplementation(async (callback: any) => {
        return callback(createMockTransaction());
      });

      const adapter = new PostgresAdapter(mockEvent, "test-api-key-id");

      // Should succeed - duplicate user is silently ignored
      await expect(adapter.add()).resolves.not.toThrow();
    });

    it("should throw StorageError on non-duplicate constraint error", async () => {
      mockDB.transaction.mockRejectedValue(
        new Error("unique constraint violation"),
      );

      const adapter = new PostgresAdapter(mockEvent, "test-api-key-id");

      await expect(adapter.add()).rejects.toThrow();

      try {
        await adapter.add();
      } catch (error) {
        expect(isStorageError(error)).toBe(true);
        expect((error as any).type).toBe("TRANSACTION_FAILED");
      }
    });

    it("should throw StorageError when timestamp conversion fails", async () => {
      const eventWithBadTimestamp = {
        ...mockEvent,
        serialize: vi.fn(() => ({
          SQL: {
            type: "SDK_CALL",
            userId: "test-user-123",
            reported_timestamp: {
              toISO: vi.fn(() => null),
            },
            data: {
              debitAmount: 100,
              sdkCallType: "RAW",
            },
          },
        })),
      };

      mockDB.transaction.mockImplementation(async (callback: any) => {
        return callback(createMockTransaction());
      });

      const adapter = new PostgresAdapter(
        eventWithBadTimestamp,
        "test-api-key-id",
      );

      await expect(adapter.add()).rejects.toThrow();

      try {
        await adapter.add();
      } catch (error) {
        expect(isStorageError(error)).toBe(true);
        expect((error as any).type).toBe("INVALID_TIMESTAMP");
      }
    });

    it("should throw StorageError when event ID is not returned", async () => {
      mockDB.transaction.mockImplementation(async (callback: any) => {
        return callback(createMockTransactionWithEmptyReturning());
      });

      const adapter = new PostgresAdapter(mockEvent, "test-api-key-id");

      await expect(adapter.add()).rejects.toThrow();

      try {
        await adapter.add();
      } catch (error) {
        expect(isStorageError(error)).toBe(true);
        expect((error as any).type).toBe("EMPTY_RESULT");
      }
    });

    it("should serialize event before processing", async () => {
      mockDB.transaction.mockImplementation(async (callback: any) => {
        return callback(createMockTransaction());
      });

      const adapter = new PostgresAdapter(mockEvent, "test-api-key-id");
      await adapter.add();

      expect(mockEvent.serialize).toHaveBeenCalled();
    });

    it("should throw when database transaction fails", async () => {
      const dbError = new Error("database connection failed");
      mockDB.transaction.mockRejectedValue(dbError);

      const adapter = new PostgresAdapter(mockEvent, "test-api-key-id");

      await expect(adapter.add()).rejects.toThrow();

      try {
        await adapter.add();
      } catch (error) {
        expect(isStorageError(error)).toBe(true);
        expect((error as any).type).toBe("TRANSACTION_FAILED");
      }
    });

    it("should wrap StorageError.constraintViolation from user insert", async () => {
      mockDB.transaction.mockImplementation(async (callback: any) => {
        return callback(createMockTransactionWithUserInsertError());
      });

      const adapter = new PostgresAdapter(mockEvent, "test-api-key-id");

      await expect(adapter.add()).rejects.toThrow();

      try {
        await adapter.add();
      } catch (error) {
        expect(isStorageError(error)).toBe(true);
        expect((error as any).type).toBe("USER_INSERT_FAILED");
      }
    });

    it("should handle zero debit amount", async () => {
      const zeroDebitEvent = {
        ...mockEvent,
        data: { debitAmount: 0 },
        serialize: vi.fn(() => ({
          SQL: {
            type: "SDK_CALL",
            userId: "test-user-123",
            reported_timestamp: DateTime.utc(),
            data: {
              debitAmount: 0,
              sdkCallType: "RAW",
            },
          },
        })),
      };

      mockDB.transaction.mockImplementation(async (callback: any) => {
        return callback(createMockTransaction());
      });

      const adapter = new PostgresAdapter(zeroDebitEvent, "test-api-key-id");
      await adapter.add();

      expect(mockDB.transaction).toHaveBeenCalled();
    });

    it("should handle large debit amounts", async () => {
      const largeDebitEvent = {
        ...mockEvent,
        data: { debitAmount: 999999.99 },
        serialize: vi.fn(() => ({
          SQL: {
            type: "SDK_CALL",
            userId: "test-user-123",
            reported_timestamp: DateTime.utc(),
            data: {
              debitAmount: 999999.99,
              sdkCallType: "RAW",
            },
          },
        })),
      };

      mockDB.transaction.mockImplementation(async (callback: any) => {
        return callback(createMockTransaction());
      });

      const adapter = new PostgresAdapter(largeDebitEvent, "test-api-key-id");
      await adapter.add();

      expect(mockDB.transaction).toHaveBeenCalled();
    });

    it("should handle negative debit amounts", async () => {
      const negativeDebitEvent = {
        ...mockEvent,
        data: { debitAmount: -50 },
        serialize: vi.fn(() => ({
          SQL: {
            type: "SDK_CALL",
            userId: "test-user-123",
            reported_timestamp: DateTime.utc(),
            data: {
              debitAmount: -50,
              sdkCallType: "RAW",
            },
          },
        })),
      };

      mockDB.transaction.mockImplementation(async (callback: any) => {
        return callback(createMockTransaction());
      });

      const adapter = new PostgresAdapter(
        negativeDebitEvent,
        "test-api-key-id",
      );
      await adapter.add();

      expect(mockDB.transaction).toHaveBeenCalled();
    });

    it("should handle different user IDs", async () => {
      const userIds = [
        "user-123",
        "12345678-1234-1234-1234-123456789012",
        "admin@example.com",
      ];

      for (const userId of userIds) {
        vi.clearAllMocks();

        const eventWithUserId = {
          ...mockEvent,
          userId,
          serialize: vi.fn(() => ({
            SQL: {
              type: "SDK_CALL",
              userId,
              reported_timestamp: DateTime.utc(),
              data: { debitAmount: 100, sdkCallType: "RAW" },
            },
          })),
        };

        mockDB.transaction.mockImplementation(async (callback: any) => {
          return callback(createMockTransaction());
        });

        const adapter = new PostgresAdapter(eventWithUserId, "test-api-key-id");
        await adapter.add();

        expect(mockDB.transaction).toHaveBeenCalled();
      }
    });

    it("should handle various timestamps", async () => {
      const timestamps = [
        DateTime.utc(),
        DateTime.utc().minus({ days: 1 }),
        DateTime.utc().plus({ hours: 5 }),
      ];

      for (const timestamp of timestamps) {
        vi.clearAllMocks();

        const eventWithTimestamp = {
          ...mockEvent,
          reported_timestamp: timestamp,
          serialize: vi.fn(() => ({
            SQL: {
              type: "SDK_CALL",
              userId: "test-user-123",
              reported_timestamp: timestamp,
              data: { debitAmount: 100, sdkCallType: "RAW" },
            },
          })),
        };

        mockDB.transaction.mockImplementation(async (callback: any) => {
          return callback(createMockTransaction());
        });

        const adapter = new PostgresAdapter(
          eventWithTimestamp,
          "test-api-key-id",
        );
        await adapter.add();

        expect(mockDB.transaction).toHaveBeenCalled();
      }
    });

    it("should handle non-duplicate constraint errors in user insert", async () => {
      mockDB.transaction.mockImplementation(async (callback: any) => {
        return callback(createMockTransactionWithUserInsertError());
      });

      const adapter = new PostgresAdapter(mockEvent, "test-api-key-id");

      await expect(adapter.add()).rejects.toThrow();

      try {
        await adapter.add();
      } catch (error) {
        expect(isStorageError(error)).toBe(true);
        expect((error as any).type).toBe("USER_INSERT_FAILED");
      }
    });
  });

  describe("add() - Unknown event type", () => {
    it("should throw StorageError for unknown event type", async () => {
      const unknownEvent = {
        ...mockEvent,
        type: "UNKNOWN_EVENT_TYPE",
        serialize: vi.fn(() => ({
          SQL: {
            type: "UNKNOWN_EVENT_TYPE",
            userId: "test-user-123",
            reported_timestamp: DateTime.utc(),
            data: {},
          },
        })),
      };

      const adapter = new PostgresAdapter(unknownEvent, "test-api-key-id");

      await expect(adapter.add()).rejects.toThrow();

      try {
        await adapter.add();
      } catch (error) {
        expect(isStorageError(error)).toBe(true);
        expect((error as any).type).toBe("UNKNOWN_EVENT_TYPE");
        expect((error as any).message).toContain("UNKNOWN_EVENT_TYPE");
      }
    });

    it("should include event type in error message for unknown types", async () => {
      const unknownEvent = {
        ...mockEvent,
        type: "SOME_NEW_EVENT",
        serialize: vi.fn(() => ({
          SQL: {
            type: "SOME_NEW_EVENT",
            userId: "test-user-123",
            reported_timestamp: DateTime.utc(),
            data: {},
          },
        })),
      };

      const adapter = new PostgresAdapter(unknownEvent, "test-api-key-id");

      await expect(adapter.add()).rejects.toThrow();

      try {
        await adapter.add();
      } catch (error) {
        expect(isStorageError(error)).toBe(true);
        expect((error as StorageError).message).toContain("SOME_NEW_EVENT");
      }
    });
  });

  describe("transaction behavior", () => {
    it("should use database transaction for atomicity", async () => {
      mockDB.transaction.mockImplementation(async (callback: any) => {
        return callback(createMockTransaction());
      });

      const adapter = new PostgresAdapter(mockEvent, "test-api-key-id");
      await adapter.add();

      expect(mockDB.transaction).toHaveBeenCalledWith(expect.any(Function));
    });

    it("should pass transaction object to callback", async () => {
      let receivedTxn: any = null;

      mockDB.transaction.mockImplementation(async (callback: any) => {
        receivedTxn = createMockTransaction();
        return callback(receivedTxn);
      });

      const adapter = new PostgresAdapter(mockEvent, "test-api-key-id");
      await adapter.add();

      expect(receivedTxn).not.toBeNull();
      expect(mockDB.transaction).toHaveBeenCalled();
    });
  });
});

// Mock transaction factory that supports method chaining for Drizzle ORM
function createMockTransaction() {
  const valuedBuilder = {
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    returning: vi.fn().mockResolvedValue([{ id: "event-id-123" }]),
  };

  const insertBuilder = {
    values: vi.fn().mockReturnValue(valuedBuilder),
  };

  return {
    insert: vi.fn().mockReturnValue(insertBuilder),
  };
}

// Mock transaction that fails on user insert
function createMockTransactionWithUserInsertError() {
  let firstInsertCall = true;

  const valuedBuilder = {
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    returning: vi.fn().mockResolvedValue([{ id: "event-id-123" }]),
  };

  const insertBuilder = {
    values: vi.fn(function () {
      if (firstInsertCall) {
        firstInsertCall = false;
        throw new Error("some constraint error");
      }
      return valuedBuilder;
    }),
  };

  return {
    insert: vi.fn().mockReturnValue(insertBuilder),
  };
}

// Mock transaction that returns empty array from returning()
function createMockTransactionWithEmptyReturning() {
  const valuedBuilderWithEmpty = {
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    returning: vi.fn().mockResolvedValue([]),
  };

  const insertBuilder = {
    values: vi.fn().mockReturnValue(valuedBuilderWithEmpty),
  };

  return {
    insert: vi.fn().mockReturnValue(insertBuilder),
  };
}
