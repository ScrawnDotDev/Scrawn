import { describe, it, expect, beforeEach, vi } from "vitest";
import { DateTime } from "luxon";
import { PostgresAdapter } from "../storage/adapter/postgres";
import { StorageError } from "../errors/storage";
import { isStorageError } from "./helpers/error";

// Mock the database module
vi.mock("../storage/db/postgres/db", () => ({
  getPostgresDB: vi.fn(),
}));

import { getPostgresDB } from "../storage/db/postgres/db";

describe("PostgresAdapter", () => {
  let mockEvent: any;
  let mockDB: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock event
    mockEvent = {
      type: "SERVERLESS_FUNCTION_CALL",
      userId: "test-user-123",
      reported_timestamp: DateTime.utc(),
      data: {
        debitAmount: 100,
      },
      serialize: vi.fn(() => ({
        SQL: {
          type: "SERVERLESS_FUNCTION_CALL",
          userId: "test-user-123",
          reported_timestamp: DateTime.utc(),
          data: {
            debitAmount: 100,
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
      const adapter = new PostgresAdapter(mockEvent);
      expect(adapter.name).toBe("SERVERLESS_FUNCTION_CALL");
    });

    it("should set event property correctly", () => {
      const adapter = new PostgresAdapter(mockEvent);
      expect(adapter.event).toBe(mockEvent);
    });

    it("should initialize connectionObject from getPostgresDB", () => {
      const adapter = new PostgresAdapter(mockEvent);
      expect(adapter.connectionObject).toBe(mockDB);
      expect(getPostgresDB).toHaveBeenCalled();
    });
  });

  describe("add() - SERVERLESS_FUNCTION_CALL event", () => {
    it("should execute transaction with correct event data", async () => {
      mockDB.transaction.mockImplementation(async (callback: any) => {
        const txn = createMockTransaction();
        return callback(txn);
      });

      const adapter = new PostgresAdapter(mockEvent);
      await adapter.add();

      expect(mockEvent.serialize).toHaveBeenCalled();
      expect(mockDB.transaction).toHaveBeenCalled();
    });

    it("should handle duplicate user error gracefully", async () => {
      mockDB.transaction.mockImplementation(async (callback: any) => {
        const txn = {
          insert: vi.fn().mockReturnThis(),
          values: vi
            .fn()
            .mockRejectedValueOnce(
              new Error("duplicate key value violates unique constraint"),
            )
            .mockReturnThis()
            .mockReturnThis(),
          returning: vi.fn().mockResolvedValue([{ id: "event-id-123" }]),
        };
        return callback(txn);
      });

      const adapter = new PostgresAdapter(mockEvent);

      // Should succeed - duplicate user is silently ignored
      await expect(adapter.add()).resolves.not.toThrow();
    });

    it("should throw StorageError on non-duplicate constraint error", async () => {
      mockDB.transaction.mockRejectedValue(
        new Error("unique constraint violation"),
      );

      const adapter = new PostgresAdapter(mockEvent);

      try {
        await adapter.add();
        expect.fail("Should have thrown");
      } catch (error) {
        expect(isStorageError(error)).toBe(true);
      }
    });

    it("should throw StorageError when timestamp conversion fails", async () => {
      const eventWithBadTimestamp = {
        ...mockEvent,
        serialize: vi.fn(() => ({
          SQL: {
            type: "SERVERLESS_FUNCTION_CALL",
            userId: "test-user-123",
            reported_timestamp: {
              toSQL: vi.fn(() => null),
            },
            data: {
              debitAmount: 100,
            },
          },
        })),
      };

      mockDB.transaction.mockImplementation(async (callback: any) => {
        const txn = createMockTransaction();
        return callback(txn);
      });

      const adapter = new PostgresAdapter(eventWithBadTimestamp);

      try {
        await adapter.add();
        expect.fail("Should have thrown");
      } catch (error) {
        expect(isStorageError(error)).toBe(true);
        // Errors from within transaction are wrapped in TRANSACTION_FAILED
        expect((error as any).type).toBe("TRANSACTION_FAILED");
      }
    });

    it("should throw StorageError when event ID is not returned", async () => {
      mockDB.transaction.mockImplementation(async (callback: any) => {
        const txn = {
          insert: vi.fn().mockReturnThis(),
          values: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([]),
        };
        return callback(txn);
      });

      const adapter = new PostgresAdapter(mockEvent);

      try {
        await adapter.add();
        expect.fail("Should have thrown StorageError");
      } catch (error) {
        expect(isStorageError(error)).toBe(true);
        // Errors from within transaction are wrapped in TRANSACTION_FAILED
        expect((error as any).type).toBe("TRANSACTION_FAILED");
      }
    });

    it("should serialize event before processing", async () => {
      mockDB.transaction.mockImplementation(async (callback: any) => {
        const txn = createMockTransaction();
        return callback(txn);
      });

      const adapter = new PostgresAdapter(mockEvent);
      await adapter.add();

      expect(mockEvent.serialize).toHaveBeenCalled();
    });

    it("should throw when database transaction fails", async () => {
      const dbError = new Error("database connection failed");
      mockDB.transaction.mockRejectedValue(dbError);

      const adapter = new PostgresAdapter(mockEvent);

      try {
        await adapter.add();
        expect.fail("Should have thrown");
      } catch (error) {
        expect(isStorageError(error)).toBe(true);
        expect((error as any).type).toBe("TRANSACTION_FAILED");
      }
    });

    it("should wrap StorageError.constraintViolation from user insert", async () => {
      mockDB.transaction.mockImplementation(async (callback: any) => {
        const txn = {
          insert: vi.fn().mockReturnThis(),
          values: vi
            .fn()
            .mockRejectedValueOnce(new Error("some constraint error")),
        };
        return callback(txn);
      });

      const adapter = new PostgresAdapter(mockEvent);

      try {
        await adapter.add();
        expect.fail("Should have thrown StorageError");
      } catch (error) {
        expect(isStorageError(error)).toBe(true);
        expect((error as any).type).toBe("TRANSACTION_FAILED");
      }
    });

    it("should handle zero debit amount", async () => {
      const zeroDebitEvent = {
        ...mockEvent,
        data: { debitAmount: 0 },
        serialize: vi.fn(() => ({
          SQL: {
            type: "SERVERLESS_FUNCTION_CALL",
            userId: "test-user-123",
            reported_timestamp: DateTime.utc(),
            data: {
              debitAmount: 0,
            },
          },
        })),
      };

      mockDB.transaction.mockImplementation(async (callback: any) => {
        const txn = createMockTransaction();
        return callback(txn);
      });

      const adapter = new PostgresAdapter(zeroDebitEvent);
      await adapter.add();

      expect(mockDB.transaction).toHaveBeenCalled();
    });

    it("should handle large debit amounts", async () => {
      const largeDebitEvent = {
        ...mockEvent,
        data: { debitAmount: 999999.99 },
        serialize: vi.fn(() => ({
          SQL: {
            type: "SERVERLESS_FUNCTION_CALL",
            userId: "test-user-123",
            reported_timestamp: DateTime.utc(),
            data: {
              debitAmount: 999999.99,
            },
          },
        })),
      };

      mockDB.transaction.mockImplementation(async (callback: any) => {
        const txn = createMockTransaction();
        return callback(txn);
      });

      const adapter = new PostgresAdapter(largeDebitEvent);
      await adapter.add();

      expect(mockDB.transaction).toHaveBeenCalled();
    });

    it("should handle negative debit amounts", async () => {
      const negativeDebitEvent = {
        ...mockEvent,
        data: { debitAmount: -50 },
        serialize: vi.fn(() => ({
          SQL: {
            type: "SERVERLESS_FUNCTION_CALL",
            userId: "test-user-123",
            reported_timestamp: DateTime.utc(),
            data: {
              debitAmount: -50,
            },
          },
        })),
      };

      mockDB.transaction.mockImplementation(async (callback: any) => {
        const txn = createMockTransaction();
        return callback(txn);
      });

      const adapter = new PostgresAdapter(negativeDebitEvent);
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
              type: "SERVERLESS_FUNCTION_CALL",
              userId,
              reported_timestamp: DateTime.utc(),
              data: { debitAmount: 100 },
            },
          })),
        };

        mockDB.transaction.mockImplementation(async (callback: any) => {
          const txn = createMockTransaction();
          return callback(txn);
        });

        const adapter = new PostgresAdapter(eventWithUserId);
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
              type: "SERVERLESS_FUNCTION_CALL",
              userId: "test-user-123",
              reported_timestamp: timestamp,
              data: { debitAmount: 100 },
            },
          })),
        };

        mockDB.transaction.mockImplementation(async (callback: any) => {
          const txn = createMockTransaction();
          return callback(txn);
        });

        const adapter = new PostgresAdapter(eventWithTimestamp);
        await adapter.add();

        expect(mockDB.transaction).toHaveBeenCalled();
      }
    });

    it("should handle non-duplicate constraint errors in user insert", async () => {
      mockDB.transaction.mockImplementation(async (callback: any) => {
        const txn = {
          insert: vi.fn().mockReturnThis(),
          values: vi
            .fn()
            .mockRejectedValueOnce(
              new Error("foreign key constraint violation"),
            ),
        };
        return callback(txn);
      });

      const adapter = new PostgresAdapter(mockEvent);

      try {
        await adapter.add();
        expect.fail("Should have thrown StorageError");
      } catch (error) {
        expect(isStorageError(error)).toBe(true);
        // The error gets wrapped in TRANSACTION_FAILED by outer try-catch
        expect((error as any).type).toBe("TRANSACTION_FAILED");
      }
    });
  });

  describe("add() - Unknown event type", () => {
    it("should throw StorageError for unknown event type", async () => {
      const unknownEvent = {
        ...mockEvent,
        type: "UNKNOWN_EVENT_TYPE",
      };

      const adapter = new PostgresAdapter(unknownEvent);

      try {
        await adapter.add();
        expect.fail("Should have thrown");
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
      };

      const adapter = new PostgresAdapter(unknownEvent);

      try {
        await adapter.add();
        expect.fail("Should have thrown StorageError");
      } catch (error) {
        expect((error as StorageError).message).toContain("SOME_NEW_EVENT");
      }
    });
  });

  describe("transaction behavior", () => {
    it("should use database transaction for atomicity", async () => {
      mockDB.transaction.mockImplementation(async (callback: any) => {
        const txn = createMockTransaction();
        return callback(txn);
      });

      const adapter = new PostgresAdapter(mockEvent);
      await adapter.add();

      expect(mockDB.transaction).toHaveBeenCalledWith(expect.any(Function));
    });

    it("should pass transaction object to callback", async () => {
      let receivedTxn: any = null;

      mockDB.transaction.mockImplementation(async (callback: any) => {
        receivedTxn = createMockTransaction();
        return callback(receivedTxn);
      });

      const adapter = new PostgresAdapter(mockEvent);
      await adapter.add();

      expect(receivedTxn).not.toBeNull();
      expect(mockDB.transaction).toHaveBeenCalled();
    });
  });
});

// Helper function to create mock transaction
function createMockTransaction() {
  return {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: "event-id-123" }]),
  };
}
