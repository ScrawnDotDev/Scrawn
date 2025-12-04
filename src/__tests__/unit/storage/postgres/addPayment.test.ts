import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PostgresAdapter } from "../../../../storage/adapter/postgres/postgres";
import { Payment } from "../../../../events/RawEvents/Payment";
import * as dbModule from "../../../../storage/db/postgres/db";

describe("PostgresAdapter - addPayment handler", () => {
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
    it("adds PAYMENT event successfully with API key", async () => {
      const paymentEvent = new Payment("550e8400-e29b-41d4-a716-446655440000", {
        creditAmount: 5000,
      });

      mockTransaction.returning.mockResolvedValueOnce([{ id: "event-id-123" }]);

      const adapter = new PostgresAdapter(paymentEvent, "api-key-123");
      await adapter.add();

      const eventInsertCall = mockTransaction.values.mock.calls[1][0];
      expect(eventInsertCall.api_keyId).toBe("api-key-123");
    });

    it("adds PAYMENT event without apiKeyId (webhook)", async () => {
      const paymentEvent = new Payment("550e8400-e29b-41d4-a716-446655440000", {
        creditAmount: 10000,
      });

      mockTransaction.returning.mockResolvedValueOnce([{ id: "event-id-456" }]);

      const adapter = new PostgresAdapter(paymentEvent);
      await adapter.add();

      const eventInsertCall = mockTransaction.values.mock.calls[1][0];
      expect(eventInsertCall.api_keyId).toBeUndefined();
    });

    it("inserts payment event with correct credit amount", async () => {
      const paymentEvent = new Payment("550e8400-e29b-41d4-a716-446655440000", {
        creditAmount: 15000,
      });

      mockTransaction.returning.mockResolvedValueOnce([{ id: "event-id-3" }]);

      const adapter = new PostgresAdapter(paymentEvent);
      await adapter.add();

      const paymentInsertCall = mockTransaction.values.mock.calls[2][0];
      expect(paymentInsertCall.creditAmount).toBe(15000);
      expect(paymentInsertCall.id).toBe("event-id-3");
    });

    it("accepts payment with minimal positive credit amount", async () => {
      const paymentEvent = new Payment("550e8400-e29b-41d4-a716-446655440000", {
        creditAmount: 1,
      });

      mockTransaction.returning.mockResolvedValueOnce([{ id: "event-id-pos" }]);

      const adapter = new PostgresAdapter(paymentEvent);
      await adapter.add();

      const paymentInsertCall = mockTransaction.values.mock.calls[2][0];
      expect(paymentInsertCall.creditAmount).toBe(1);
      expect(paymentInsertCall.id).toBe("event-id-pos");
    });
  });

  describe("validation errors", () => {
    it("throws error when creditAmount is zero", async () => {
      const invalidEvent = {
        type: "PAYMENT" as const,
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
        data: { creditAmount: 0 },
        serialize: () => ({
          SQL: {
            type: "PAYMENT" as const,
            userId: "550e8400-e29b-41d4-a716-446655440000",
            reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
            data: { creditAmount: 0 },
          },
        }),
      };

      const adapter = new PostgresAdapter(invalidEvent as any);
      await expect(adapter.add()).rejects.toThrow(/positive/);
    });

    it("throws error when creditAmount is negative", async () => {
      const invalidEvent = {
        type: "PAYMENT" as const,
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
        data: { creditAmount: -1000 },
        serialize: () => ({
          SQL: {
            type: "PAYMENT" as const,
            userId: "550e8400-e29b-41d4-a716-446655440000",
            reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
            data: { creditAmount: -1000 },
          },
        }),
      };

      const adapter = new PostgresAdapter(invalidEvent as any);
      await expect(adapter.add()).rejects.toThrow(/positive/);
    });

    it("throws error when timestamp is empty", async () => {
      const invalidEvent = {
        type: "PAYMENT" as const,
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: { toISO: () => "   " },
        data: { creditAmount: 5000 },
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

      mockTransaction.returning.mockResolvedValueOnce([]);

      const adapter = new PostgresAdapter(invalidEvent as any);
      await expect(adapter.add()).rejects.toThrow(
        "Timestamp is undefined or empty",
      );
    });
  });

  describe("database errors", () => {
    it("handles event insert failure", async () => {
      const paymentEvent = new Payment("550e8400-e29b-41d4-a716-446655440000", {
        creditAmount: 5000,
      });

      mockTransaction.returning.mockResolvedValueOnce([]);
      mockTransaction.returning.mockRejectedValueOnce(
        new Error("Event insert failed"),
      );

      const adapter = new PostgresAdapter(paymentEvent);
      await expect(adapter.add()).rejects.toThrow();
    });

    it("handles empty event ID response", async () => {
      const paymentEvent = new Payment("550e8400-e29b-41d4-a716-446655440000", {
        creditAmount: 5000,
      });

      mockTransaction.returning.mockResolvedValueOnce([]);
      mockTransaction.returning.mockResolvedValueOnce([]);

      const adapter = new PostgresAdapter(paymentEvent);
      await expect(adapter.add()).rejects.toThrow(
        "Event insert returned no ID",
      );
    });
  });
});
