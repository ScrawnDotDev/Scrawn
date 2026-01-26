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
      ]);

      const adapter = new PostgresAdapter(sdkCallEvent, "api-key-123");
      const serialized = sdkCallEvent.serialize();
      await adapter.add(serialized);

      const eventInsertCall = mockTransaction.values.mock.calls[1][0];
      expect(eventInsertCall.api_keyId).toBe("api-key-123");
    });

    it("adds SDK_CALL event with MIDDLEWARE_CALL type successfully", async () => {
      const sdkCallEvent = new SDKCall("550e8400-e29b-41d4-a716-446655440000", {
        sdkCallType: "MIDDLEWARE_CALL",
        debitAmount: 2500,
      });

      mockTransaction.returning.mockResolvedValueOnce([{ id: "event-id-456" }]);

      const adapter = new PostgresAdapter(sdkCallEvent, "api-key-456");
      const serialized = sdkCallEvent.serialize();
      await adapter.add(serialized);

      const sdkCallInsertCall = mockTransaction.values.mock.calls[2][0];
      expect(sdkCallInsertCall.debitAmount).toBe(2500);
    });

    it("inserts event with correct timestamp format", async () => {
      const sdkCallEvent = new SDKCall("550e8400-e29b-41d4-a716-446655440000", {
        sdkCallType: "RAW",
        debitAmount: 1000,
      });

      mockTransaction.returning.mockResolvedValueOnce([{ id: "event-id-1" }]);

      const adapter = new PostgresAdapter(sdkCallEvent, "api-key-1");
      const serialized = sdkCallEvent.serialize();
      await adapter.add(serialized);

      const eventInsertCall = mockTransaction.values.mock.calls[1][0];
      expect(eventInsertCall).toHaveProperty("reported_timestamp");
      expect(typeof eventInsertCall.reported_timestamp).toBe("string");
    });

    it("accepts and stores a positive debit amount", async () => {
      const sdkCallEvent = new SDKCall("550e8400-e29b-41d4-a716-446655440000", {
        sdkCallType: "RAW",
        debitAmount: 500,
      });

      mockTransaction.returning.mockResolvedValueOnce([{ id: "event-id-pos" }]);

      const adapter = new PostgresAdapter(sdkCallEvent, "api-key-pos");
      const serialized = sdkCallEvent.serialize();
      await adapter.add(serialized);

      const insertedValues = mockTransaction.values.mock.calls.map(
        (c: any) => c[0]
      );
      const sdkCallRecord = insertedValues.find(
        (v: any) => v && v.debitAmount === 500
      );

      expect(sdkCallRecord).toBeDefined();
      expect(sdkCallRecord.debitAmount).toBeGreaterThan(0);
    });
  });

  describe("database errors", () => {
    it("handles event insert failure", async () => {
      const sdkCallEvent = new SDKCall("550e8400-e29b-41d4-a716-446655440000", {
        sdkCallType: "RAW",
        debitAmount: 1000,
      });

      mockTransaction.returning.mockRejectedValueOnce(
        new Error("Event insert failed")
      );

      const adapter = new PostgresAdapter(sdkCallEvent, "api-key");
      const serialized = sdkCallEvent.serialize();
      await expect(adapter.add(serialized)).rejects.toThrow();
    });

    it("handles empty event ID response", async () => {
      const sdkCallEvent = new SDKCall("550e8400-e29b-41d4-a716-446655440000", {
        sdkCallType: "RAW",
        debitAmount: 1000,
      });

      mockTransaction.returning.mockResolvedValueOnce([]);

      const adapter = new PostgresAdapter(sdkCallEvent, "api-key");
      const serialized = sdkCallEvent.serialize();
      await expect(adapter.add(serialized)).rejects.toThrow(
        "Event insert returned no ID"
      );
    });
  });

  describe("timestamp handling", () => {
    it("throws error when timestamp is empty", async () => {
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
      const serialized = invalidEvent.serialize() as any;
      await expect(adapter.add(serialized)).rejects.toThrow(
        "Timestamp is undefined or empty"
      );
    });
  });
});
