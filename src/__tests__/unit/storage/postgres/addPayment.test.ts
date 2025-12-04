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
    it("adds PAYMENT event successfully", async () => {
      const paymentEvent = new Payment("550e8400-e29b-41d4-a716-446655440000", {
        creditAmount: 5000,
      });

      mockTransaction.returning.mockResolvedValueOnce([{ id: "event-id-123" }]); // Event insert

      const adapter = new PostgresAdapter(paymentEvent, "api-key-123");
      await adapter.add();

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockTransaction.insert).toHaveBeenCalledTimes(3); // user, event, paymentEvent
      expect(mockTransaction.values).toHaveBeenCalledTimes(3);
    });

    it("adds PAYMENT event without apiKeyId (webhook)", async () => {
      const paymentEvent = new Payment("550e8400-e29b-41d4-a716-446655440000", {
        creditAmount: 10000,
      });

      mockTransaction.returning.mockResolvedValueOnce([{ id: "event-id-456" }]);

      const adapter = new PostgresAdapter(paymentEvent);
      await adapter.add();

      expect(mockDb.transaction).toHaveBeenCalled();
      const eventInsertCall = mockTransaction.values.mock.calls[1][0];
      expect(eventInsertCall.api_keyId).toBeUndefined();
    });

    it("handles existing user gracefully", async () => {
      const paymentEvent = new Payment("550e8400-e29b-41d4-a716-446655440000", {
        creditAmount: 7500,
      });

      mockTransaction.returning.mockResolvedValueOnce([{ id: "event-id-789" }]);

      const adapter = new PostgresAdapter(paymentEvent);
      await adapter.add();

      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it("inserts event with correct timestamp", async () => {
      const paymentEvent = new Payment("550e8400-e29b-41d4-a716-446655440000", {
        creditAmount: 2000,
      });

      mockTransaction.returning.mockResolvedValueOnce([{ id: "event-id-1" }]);

      const adapter = new PostgresAdapter(paymentEvent);
      await adapter.add();

      const eventInsertCall = mockTransaction.values.mock.calls[1][0];
      expect(eventInsertCall).toHaveProperty("reported_timestamp");
      expect(typeof eventInsertCall.reported_timestamp).toBe("string");
    });

    it("associates payment with correct API key when provided", async () => {
      const paymentEvent = new Payment("550e8400-e29b-41d4-a716-446655440000", {
        creditAmount: 3000,
      });

      const apiKeyId = "payment-api-key-id";

      mockTransaction.returning.mockResolvedValueOnce([{ id: "event-id-2" }]);

      const adapter = new PostgresAdapter(paymentEvent, apiKeyId);
      await adapter.add();

      const eventInsertCall = mockTransaction.values.mock.calls[1][0];
      expect(eventInsertCall.api_keyId).toBe(apiKeyId);
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

    it("handles large credit amounts", async () => {
      const paymentEvent = new Payment("550e8400-e29b-41d4-a716-446655440000", {
        creditAmount: 999999999,
      });

      mockTransaction.returning.mockResolvedValueOnce([{ id: "event-id-4" }]);

      const adapter = new PostgresAdapter(paymentEvent);
      await adapter.add();

      expect(mockDb.transaction).toHaveBeenCalled();
    });
  });

  describe("validation errors", () => {
    it("throws error when userId is missing", async () => {
      const invalidEvent = {
        type: "PAYMENT" as const,
        reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
        data: { creditAmount: 5000 },
        serialize: () => ({
          SQL: {
            type: "PAYMENT" as const,
            userId: undefined,
            reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
            data: { creditAmount: 5000 },
          },
        }),
      };

      const adapter = new PostgresAdapter(invalidEvent as any);
      await expect(adapter.add()).rejects.toThrow(
        "[internal] Failed to insert event: Failed to insert event for user undefined",
      );
    });

    it("throws error when data field is missing", async () => {
      const invalidEvent = {
        type: "PAYMENT" as const,
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
        data: undefined,
        serialize: () => ({
          SQL: {
            type: "PAYMENT" as const,
            userId: "550e8400-e29b-41d4-a716-446655440000",
            reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
            data: undefined,
          },
        }),
      };

      const adapter = new PostgresAdapter(invalidEvent as any);
      await expect(adapter.add()).rejects.toThrow(
        "[internal] Storage transaction failed: Transaction failed while storing PAYMENT event",
      );
    });

    it("throws error when creditAmount is not a number", async () => {
      const invalidEvent = {
        type: "PAYMENT" as const,
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
        data: { creditAmount: "5000" },
        serialize: () => ({
          SQL: {
            type: "PAYMENT" as const,
            userId: "550e8400-e29b-41d4-a716-446655440000",
            reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
            data: { creditAmount: "5000" },
          },
        }),
      };

      const adapter = new PostgresAdapter(invalidEvent as any);
      await expect(adapter.add()).rejects.toThrow(
        "[internal] Failed to insert event: Failed to insert event for user 550e8400-e29b-41d4-a716-446655440000",
      );
    });

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
      await expect(adapter.add()).rejects.toThrow("must be positive");
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
      await expect(adapter.add()).rejects.toThrow("must be positive");
    });
  });

  describe("database errors", () => {
    it("handles user insert failure", async () => {
      const paymentEvent = new Payment("550e8400-e29b-41d4-a716-446655440000", {
        creditAmount: 5000,
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

      const adapter = new PostgresAdapter(paymentEvent);
      await expect(adapter.add()).rejects.toThrow();
    });

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

    it("handles payment event insert failure", async () => {
      const paymentEvent = new Payment("550e8400-e29b-41d4-a716-446655440000", {
        creditAmount: 5000,
      });

      mockTransaction.returning.mockResolvedValueOnce([]);
      mockTransaction.returning.mockResolvedValueOnce([{ id: "event-id" }]);
      mockTransaction.returning.mockRejectedValueOnce(
        new Error("Payment event insert failed"),
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

  describe("timestamp handling", () => {
    it("handles invalid timestamp conversion", async () => {
      const invalidEvent = {
        type: "PAYMENT" as const,
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: {
          toISO: () => {
            throw new Error("Invalid date");
          },
        },
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
      await expect(adapter.add()).rejects.toThrow();
    });

    it("handles empty timestamp string", async () => {
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

  describe("transaction rollback", () => {
    it("rolls back transaction on any error", async () => {
      const paymentEvent = new Payment("550e8400-e29b-41d4-a716-446655440000", {
        creditAmount: 5000,
      });

      //@ts-ignore
      mockDb.transaction.mockImplementation(async (callback) => {
        try {
          return await callback(mockTransaction);
        } catch (e) {
          throw e;
        }
      });

      mockTransaction.returning.mockResolvedValueOnce([]);
      mockTransaction.returning.mockResolvedValueOnce([{ id: "event-id" }]);
      mockTransaction.returning.mockRejectedValueOnce(
        new Error("Final insert failed"),
      );

      const adapter = new PostgresAdapter(paymentEvent);
      await expect(adapter.add()).rejects.toThrow();
    });
  });
});
