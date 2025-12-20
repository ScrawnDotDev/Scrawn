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
    it("adds API key successfully and returns ID", async () => {
      const addKeyEvent = new AddKey({
        name: "Production API Key",
        key: "scrn_prod_12345678901234567890123456",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      mockTransaction.returning.mockResolvedValueOnce([
        { id: "api-key-id-123" },
      ]);

      const adapter = new PostgresAdapter(addKeyEvent);
      const serialized = addKeyEvent.serialize();
      const result = await adapter.add(serialized);

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
      const serialized = addKeyEvent.serialize();
      await adapter.add(serialized);

      const insertCall = mockTransaction.values.mock.calls[0][0];
      expect(insertCall.name).toBe(keyData.name);
      expect(insertCall.key).toBe(keyData.key);
      expect(insertCall.expiresAt).toBe(keyData.expiresAt);
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
      const serialized = invalidEvent.serialize() as any;
      await expect(adapter.add(serialized)).rejects.toThrow(
        "Missing data field",
      );
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
      const serialized = invalidEvent.serialize() as any;
      await expect(adapter.add(serialized)).rejects.toThrow(
        "Invalid or missing 'name'",
      );
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
      const serialized = invalidEvent.serialize() as any;
      await expect(adapter.add(serialized)).rejects.toThrow(
        "Invalid or missing 'key'",
      );
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
      const serialized = invalidEvent.serialize() as any;
      await expect(adapter.add(serialized)).rejects.toThrow(
        "API key cannot be empty",
      );
    });

    it("throws error when timestamp is empty", async () => {
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
      const serialized = invalidEvent.serialize() as any;
      await expect(adapter.add(serialized)).rejects.toThrow(
        "Timestamp is undefined or empty",
      );
    });
  });

  describe("database errors", () => {
    it("handles database insert failure", async () => {
      const addKeyEvent = new AddKey({
        name: "Test Key",
        key: "scrn_test_12345678901234567890123456",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      mockTransaction.returning.mockRejectedValueOnce(
        new Error("Database connection error"),
      );

      const adapter = new PostgresAdapter(addKeyEvent);
      const serialized = addKeyEvent.serialize();
      await expect(adapter.add(serialized)).rejects.toThrow();
    });

    it("handles empty API key ID response", async () => {
      const addKeyEvent = new AddKey({
        name: "Test Key",
        key: "scrn_test_12345678901234567890123456",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      mockTransaction.returning.mockResolvedValueOnce([]);

      const adapter = new PostgresAdapter(addKeyEvent);
      const serialized = addKeyEvent.serialize();
      await expect(adapter.add(serialized)).rejects.toThrow(
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
      const serialized = addKeyEvent.serialize();
      await expect(adapter.add(serialized)).rejects.toThrow(
        "API key insert returned object without id field",
      );
    });
  });
});
