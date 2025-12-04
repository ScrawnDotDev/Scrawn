import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PostgresAdapter } from "../../../../storage/adapter/postgres/postgres";
import { SDKCall } from "../../../../events/RawEvents/SDKCall";
import * as dbModule from "../../../../storage/db/postgres/db";

describe("PostgresAdapter - addSdkCall handler", () => {
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
      leftJoin: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
    };

    vi.spyOn(dbModule, "getPostgresDB").mockReturnValue(mockDb as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("successful operations", () => {
    it("adds SDK_CALL event with RAW type successfully", async () => {
      const sdkCallEvent = new SDKCall("550e8400-e29b-41d4-a716-446655440000", {
        sdkCallType: "RAW",
        debitAmount: 1000,
      });

      mockTransaction.returning.mockResolvedValueOnce([
        { id: "550e8400-e29b-41d4-a716-446655443214" },
      ]); // Event insert

      const adapter = new PostgresAdapter(sdkCallEvent, "api-key-123");
      await adapter.add();

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockTransaction.insert).toHaveBeenCalledTimes(3); // user, event, sdkCallEvent
      expect(mockTransaction.values).toHaveBeenCalledTimes(3);
    });

    it("adds SDK_CALL event with MIDDLEWARE_CALL type successfully", async () => {
      const sdkCallEvent = new SDKCall("550e8400-e29b-41d4-a716-446655440000", {
        sdkCallType: "MIDDLEWARE_CALL",
        debitAmount: 2500,
      });

      mockTransaction.returning.mockResolvedValueOnce([{ id: "event-id-456" }]); // Event insert

      const adapter = new PostgresAdapter(sdkCallEvent, "api-key-456");
      await adapter.add();

      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it("handles existing user gracefully", async () => {
      const sdkCallEvent = new SDKCall("550e8400-e29b-41d4-a716-446655440000", {
        sdkCallType: "RAW",
        debitAmount: 1500,
      });

      // Simulate user already exists
      mockTransaction.returning.mockResolvedValueOnce([{ id: "event-id-789" }]); // Event insert

      const adapter = new PostgresAdapter(sdkCallEvent, "api-key-789");
      await adapter.add();

      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it("inserts event with correct timestamp", async () => {
      const sdkCallEvent = new SDKCall("550e8400-e29b-41d4-a716-446655440000", {
        sdkCallType: "RAW",
        debitAmount: 1000,
      });

      mockTransaction.returning.mockResolvedValueOnce([{ id: "event-id-1" }]);

      const adapter = new PostgresAdapter(sdkCallEvent, "api-key-1");
      await adapter.add();

      // Verify timestamp was converted to ISO
      const eventInsertCall = mockTransaction.values.mock.calls[1][0];
      expect(eventInsertCall).toHaveProperty("reported_timestamp");
      expect(typeof eventInsertCall.reported_timestamp).toBe("string");
    });

    it("handles zero debit amount", async () => {
      const sdkCallEvent = new SDKCall("550e8400-e29b-41d4-a716-446655440000", {
        sdkCallType: "RAW",
        debitAmount: 0,
      });

      mockTransaction.returning.mockResolvedValueOnce([{ id: "event-id-2" }]);

      const adapter = new PostgresAdapter(sdkCallEvent, "api-key-2");
      await adapter.add();

      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it("associates event with correct API key", async () => {
      const sdkCallEvent = new SDKCall("550e8400-e29b-41d4-a716-446655440000", {
        sdkCallType: "RAW",
        debitAmount: 1000,
      });

      const apiKeyId = "specific-api-key-id";
      mockTransaction.returning.mockResolvedValueOnce([{ id: "event-id-4" }]);

      const adapter = new PostgresAdapter(sdkCallEvent, apiKeyId);
      await adapter.add();

      const eventInsertCall = mockTransaction.values.mock.calls[1][0];
      expect(eventInsertCall.api_keyId).toBe(apiKeyId);
    });
  });

  describe("database errors", () => {
    it("handles user insert failure", async () => {
      const sdkCallEvent = new SDKCall("550e8400-e29b-41d4-a716-446655440000", {
        sdkCallType: "RAW",
        debitAmount: 1000,
      });

      //@ts-ignore
      mockDb.transaction.mockImplementation(async (callback) => {
        const txn = {
          insert: vi.fn().mockReturnThis(),
          values: vi.fn().mockReturnThis(),
          returning: vi.fn(),
          onConflictDoNothing: vi
            .fn()
            .mockRejectedValue(new Error("Database connection error")),
        };
        return await callback(txn);
      });

      const adapter = new PostgresAdapter(sdkCallEvent, "api-key");
      await expect(adapter.add()).rejects.toThrow();
    });

    it("handles event insert failure", async () => {
      const sdkCallEvent = new SDKCall("550e8400-e29b-41d4-a716-446655440000", {
        sdkCallType: "RAW",
        debitAmount: 1000,
      });

      mockTransaction.returning.mockRejectedValueOnce(
        new Error("Event insert failed"),
      );

      const adapter = new PostgresAdapter(sdkCallEvent, "api-key");
      await expect(adapter.add()).rejects.toThrow();
    });

    it("handles SDK call event insert failure", async () => {
      const sdkCallEvent = new SDKCall("550e8400-e29b-41d4-a716-446655440000", {
        sdkCallType: "RAW",
        debitAmount: 1000,
      });

      mockTransaction.returning.mockResolvedValueOnce([{ id: "event-id" }]); // Event insert

      // Make the third insert (SDK call event) fail
      let insertCallCount = 0;
      mockTransaction.insert.mockImplementation(() => {
        insertCallCount++;
        if (insertCallCount === 3) {
          throw new Error("SDK call event insert failed");
        }
        return mockTransaction;
      });

      const adapter = new PostgresAdapter(sdkCallEvent, "api-key");
      await expect(adapter.add()).rejects.toThrow();
    });

    it("handles empty event ID response", async () => {
      const sdkCallEvent = new SDKCall("550e8400-e29b-41d4-a716-446655440000", {
        sdkCallType: "RAW",
        debitAmount: 1000,
      });

      mockTransaction.returning.mockResolvedValueOnce([]); // Empty event ID

      const adapter = new PostgresAdapter(sdkCallEvent, "api-key");
      await expect(adapter.add()).rejects.toThrow(
        "Event insert returned no ID",
      );
    });
  });

  describe("timestamp handling", () => {
    it("handles invalid timestamp conversion", async () => {
      const invalidEvent = {
        type: "SDK_CALL" as const,
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: {
          toISO: () => {
            throw new Error("Invalid date");
          },
        },
        data: { sdkCallType: "RAW", debitAmount: 1000 },
        serialize: function () {
          return {
            SQL: {
              type: this.type,
              userId: this.userId,
              reported_timestamp: this.reported_timestamp,
              data: this.data,
            },
          };
        },
      };

      const adapter = new PostgresAdapter(invalidEvent as any, "api-key");
      await expect(adapter.add()).rejects.toThrow();
    });

    it("handles empty timestamp string", async () => {
      const invalidEvent = {
        type: "SDK_CALL" as const,
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: { toISO: () => "" },
        data: { sdkCallType: "RAW", debitAmount: 1000 },
        serialize: function () {
          return {
            SQL: {
              type: this.type,
              userId: this.userId,
              reported_timestamp: this.reported_timestamp,
              data: this.data,
            },
          };
        },
      };

      const adapter = new PostgresAdapter(invalidEvent as any, "api-key");
      await expect(adapter.add()).rejects.toThrow(
        "Timestamp is undefined or empty",
      );
    });
  });
});
