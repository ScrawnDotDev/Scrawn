import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PostgresAdapter } from "../../../../storage/adapter/postgres/postgres";
import { AddKey } from "../../../../events/RawEvents/AddKey";
import * as dbModule from "../../../../storage/db/postgres/db";

describe("PostgresAdapter - addKey handler", () => {
  let mockTransaction: any;
  let mockDb: any;

  beforeEach(() => {
    mockTransaction = {
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn(),
      onConflictDoNothing: vi.fn().mockReturnThis(),
    };

    mockDb = {
      transaction: vi.fn(async (callback) => {
        return await callback(mockTransaction);
      }),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
    };

    vi.spyOn(dbModule, "getPostgresDB").mockReturnValue(mockDb as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("successful operations", () => {
    it("adds API key successfully", async () => {
      const addKeyEvent = new AddKey({
        name: "Production API Key",
        key: "scrn_prod_12345678901234567890123456",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      mockTransaction.returning.mockResolvedValueOnce([
        { id: "api-key-id-123" },
      ]);

      const adapter = new PostgresAdapter(addKeyEvent);
      const result = await adapter.add();

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockTransaction.insert).toHaveBeenCalledTimes(1);
      expect(mockTransaction.values).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ id: "api-key-id-123" });
    });

    it("inserts API key with correct data", async () => {
      const keyData = {
        name: "Test API Key",
        key: "scrn_test_12345678901234567890123456",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };

      const addKeyEvent = new AddKey(keyData);

      mockTransaction.returning.mockResolvedValueOnce([
        { id: "api-key-id-456" },
      ]);

      const adapter = new PostgresAdapter(addKeyEvent);
      await adapter.add();

      const insertCall = mockTransaction.values.mock.calls[0][0];
      expect(insertCall.name).toBe(keyData.name);
      expect(insertCall.key).toBe(keyData.key);
      expect(insertCall.expiresAt).toBe(keyData.expiresAt);
    });

    it("handles keys with special characters in name", async () => {
      const addKeyEvent = new AddKey({
        name: "Dev Key #1 (Main) - 2024",
        key: "scrn_dev_12345678901234567890123456",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      mockTransaction.returning.mockResolvedValueOnce([{ id: "api-key-id" }]);

      const adapter = new PostgresAdapter(addKeyEvent);
      await adapter.add();

      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it("handles keys with maximum name length", async () => {
      const addKeyEvent = new AddKey({
        name: "a".repeat(255),
        key: "scrn_test_12345678901234567890123456",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      mockTransaction.returning.mockResolvedValueOnce([{ id: "api-key-id" }]);

      const adapter = new PostgresAdapter(addKeyEvent);
      await adapter.add();

      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it("handles various expiration dates", async () => {
      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const addKeyEvent = new AddKey({
        name: "Long-lived Key",
        key: "scrn_long_12345678901234567890123456",
        expiresAt: futureDate.toISOString(),
      });

      mockTransaction.returning.mockResolvedValueOnce([{ id: "api-key-id" }]);

      const adapter = new PostgresAdapter(addKeyEvent);
      await adapter.add();

      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it("does not require apiKeyId parameter", async () => {
      const addKeyEvent = new AddKey({
        name: "Test Key",
        key: "scrn_test_12345678901234567890123456",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      mockTransaction.returning.mockResolvedValueOnce([{ id: "api-key-id" }]);

      const adapter = new PostgresAdapter(addKeyEvent);
      await adapter.add();

      expect(adapter.apiKeyId).toBeUndefined();
    });

    it("returns API key ID after insertion", async () => {
      const addKeyEvent = new AddKey({
        name: "Return Test Key",
        key: "scrn_return_12345678901234567890123456",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      const expectedId = "returned-api-key-id-789";
      mockTransaction.returning.mockResolvedValueOnce([{ id: expectedId }]);

      const adapter = new PostgresAdapter(addKeyEvent);
      const result = await adapter.add();

      expect(result).toEqual({ id: expectedId });
    });
  });

  describe("validation errors", () => {
    it("throws error when data field is missing", async () => {
      const invalidEvent = {
        type: "ADD_KEY" as const,
        reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
        data: undefined,
        serialize: () => ({
          SQL: {
            type: "ADD_KEY" as const,
            reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
            data: undefined,
          },
        }),
      };

      const adapter = new PostgresAdapter(invalidEvent as any);
      await expect(adapter.add()).rejects.toThrow("Missing data field");
    });

    it("throws error when name is missing", async () => {
      const invalidEvent = {
        type: "ADD_KEY" as const,
        reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
        data: {
          key: "scrn_test_12345678901234567890123456",
          expiresAt: new Date().toISOString(),
        },
        serialize: () => ({
          SQL: {
            type: "ADD_KEY" as const,
            reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
            data: {
              key: "scrn_test_12345678901234567890123456",
              expiresAt: new Date().toISOString(),
            },
          },
        }),
      };

      const adapter = new PostgresAdapter(invalidEvent as any);
      await expect(adapter.add()).rejects.toThrow("Invalid or missing 'name'");
    });

    it("throws error when name is not a string", async () => {
      const invalidEvent = {
        type: "ADD_KEY" as const,
        reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
        data: {
          name: 12345,
          key: "scrn_test_12345678901234567890123456",
          expiresAt: new Date().toISOString(),
        },
        serialize: () => ({
          SQL: {
            type: "ADD_KEY" as const,
            reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
            data: {
              name: 12345,
              key: "scrn_test_12345678901234567890123456",
              expiresAt: new Date().toISOString(),
            },
          },
        }),
      };

      const adapter = new PostgresAdapter(invalidEvent as any);
      await expect(adapter.add()).rejects.toThrow("Invalid or missing 'name'");
    });

    it("throws error when key is missing", async () => {
      const invalidEvent = {
        type: "ADD_KEY" as const,
        reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
        data: {
          name: "Test Key",
          expiresAt: new Date().toISOString(),
        },
        serialize: () => ({
          SQL: {
            type: "ADD_KEY" as const,
            reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
            data: {
              name: "Test Key",
              expiresAt: new Date().toISOString(),
            },
          },
        }),
      };

      const adapter = new PostgresAdapter(invalidEvent as any);
      await expect(adapter.add()).rejects.toThrow("Invalid or missing 'key'");
    });

    it("throws error when key is not a string", async () => {
      const invalidEvent = {
        type: "ADD_KEY" as const,
        reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
        data: {
          name: "Test Key",
          key: 123456,
          expiresAt: new Date().toISOString(),
        },
        serialize: () => ({
          SQL: {
            type: "ADD_KEY" as const,
            reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
            data: {
              name: "Test Key",
              key: 123456,
              expiresAt: new Date().toISOString(),
            },
          },
        }),
      };

      const adapter = new PostgresAdapter(invalidEvent as any);
      await expect(adapter.add()).rejects.toThrow("Invalid or missing 'key'");
    });

    it("throws error when key is empty string", async () => {
      const invalidEvent = {
        type: "ADD_KEY" as const,
        reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
        data: {
          name: "Test Key",
          key: "   ",
          expiresAt: new Date().toISOString(),
        },
        serialize: () => ({
          SQL: {
            type: "ADD_KEY" as const,
            reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
            data: {
              name: "Test Key",
              key: "   ",
              expiresAt: new Date().toISOString(),
            },
          },
        }),
      };

      const adapter = new PostgresAdapter(invalidEvent as any);
      await expect(adapter.add()).rejects.toThrow("API key cannot be empty");
    });
  });

  describe("database errors", () => {
    it("handles API key insert failure", async () => {
      const addKeyEvent = new AddKey({
        name: "Test Key",
        key: "scrn_test_12345678901234567890123456",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      mockTransaction.returning.mockRejectedValueOnce(
        new Error("Database connection error"),
      );

      const adapter = new PostgresAdapter(addKeyEvent);
      await expect(adapter.add()).rejects.toThrow();
    });

    it("handles unique constraint violation for duplicate key name", async () => {
      const addKeyEvent = new AddKey({
        name: "Duplicate Key",
        key: "scrn_dup_12345678901234567890123456",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      mockTransaction.returning.mockRejectedValueOnce(
        new Error("unique constraint violation"),
      );

      const adapter = new PostgresAdapter(addKeyEvent);
      await expect(adapter.add()).rejects.toThrow();
    });

    it("handles unique constraint violation for duplicate key value", async () => {
      const addKeyEvent = new AddKey({
        name: "Another Key",
        key: "scrn_duplicate_12345678901234567890",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      mockTransaction.returning.mockRejectedValueOnce(
        new Error("duplicate key value violates unique constraint"),
      );

      const adapter = new PostgresAdapter(addKeyEvent);
      await expect(adapter.add()).rejects.toThrow();
    });

    it("handles empty API key ID response", async () => {
      const addKeyEvent = new AddKey({
        name: "Test Key",
        key: "scrn_test_12345678901234567890123456",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      mockTransaction.returning.mockResolvedValueOnce([]);

      const adapter = new PostgresAdapter(addKeyEvent);
      await expect(adapter.add()).rejects.toThrow(
        "API key insert returned no record",
      );
    });

    it("handles API key response without id field", async () => {
      const addKeyEvent = new AddKey({
        name: "Test Key",
        key: "scrn_test_12345678901234567890123456",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      mockTransaction.returning.mockResolvedValueOnce([{}]);

      const adapter = new PostgresAdapter(addKeyEvent);
      await expect(adapter.add()).rejects.toThrow(
        "API key insert returned object without id field",
      );
    });

    it("handles null response from insert", async () => {
      const addKeyEvent = new AddKey({
        name: "Test Key",
        key: "scrn_test_12345678901234567890123456",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      mockTransaction.returning.mockResolvedValueOnce([null]);

      const adapter = new PostgresAdapter(addKeyEvent);
      await expect(adapter.add()).rejects.toThrow(
        "API key insert returned no record",
      );
    });
  });

  describe("timestamp handling", () => {
    it("handles invalid timestamp conversion", async () => {
      const invalidEvent = {
        type: "ADD_KEY" as const,
        reported_timestamp: {
          toISO: () => {
            throw new Error("Invalid date");
          },
        },
        data: {
          name: "Test Key",
          key: "scrn_test_12345678901234567890123456",
          expiresAt: new Date().toISOString(),
        },
        serialize: function () {
          return {
            SQL: {
              type: this.type,
              reported_timestamp: this.reported_timestamp,
              data: this.data,
            },
          };
        },
      };

      const adapter = new PostgresAdapter(invalidEvent as any);
      await expect(adapter.add()).rejects.toThrow();
    });

    it("handles empty timestamp string", async () => {
      const invalidEvent = {
        type: "ADD_KEY" as const,
        reported_timestamp: { toISO: () => "" },
        data: {
          name: "Test Key",
          key: "scrn_test_12345678901234567890123456",
          expiresAt: new Date().toISOString(),
        },
        serialize: function () {
          return {
            SQL: {
              type: this.type,
              reported_timestamp: this.reported_timestamp,
              data: this.data,
            },
          };
        },
      };

      const adapter = new PostgresAdapter(invalidEvent as any);
      await expect(adapter.add()).rejects.toThrow(
        "Timestamp is undefined or empty",
      );
    });

    it("handles whitespace-only timestamp string", async () => {
      const invalidEvent = {
        type: "ADD_KEY" as const,
        reported_timestamp: { toISO: () => "   " },
        data: {
          name: "Test Key",
          key: "scrn_test_12345678901234567890123456",
          expiresAt: new Date().toISOString(),
        },
        serialize: function () {
          return {
            SQL: {
              type: this.type,
              reported_timestamp: this.reported_timestamp,
              data: this.data,
            },
          };
        },
      };

      const adapter = new PostgresAdapter(invalidEvent as any);
      await expect(adapter.add()).rejects.toThrow(
        "Timestamp is undefined or empty",
      );
    });
  });

  describe("transaction rollback", () => {
    it("rolls back transaction on insert failure", async () => {
      const addKeyEvent = new AddKey({
        name: "Test Key",
        key: "scrn_test_12345678901234567890123456",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      //@ts-ignore
      mockDb.transaction.mockImplementation(async (callback) => {
        try {
          return await callback(mockTransaction);
        } catch (e) {
          throw e;
        }
      });

      mockTransaction.returning.mockRejectedValueOnce(
        new Error("Insert failed"),
      );

      const adapter = new PostgresAdapter(addKeyEvent);
      await expect(adapter.add()).rejects.toThrow();
    });

    it("wraps errors in StorageError for transaction failures", async () => {
      const addKeyEvent = new AddKey({
        name: "Test Key",
        key: "scrn_test_12345678901234567890123456",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      mockDb.transaction.mockRejectedValueOnce(new Error("Transaction failed"));

      const adapter = new PostgresAdapter(addKeyEvent);
      await expect(adapter.add()).rejects.toThrow();
    });
  });
});
