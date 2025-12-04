import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PostgresAdapter } from "../../../../storage/adapter/postgres/postgres";
import { RequestPayment } from "../../../../events/RequestEvents/RequestPayment";
import * as dbModule from "../../../../storage/db/postgres/db";
import * as factoryModule from "../../../../factory";

describe("PostgresAdapter - priceRequestPayment handler", () => {
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      transaction: vi.fn(),
    };

    vi.spyOn(dbModule, "getPostgresDB").mockReturnValue(mockDb as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("successful operations", () => {
    it("calculates price by delegating to REQUEST_SDK_CALL handler", async () => {
      const requestEvent = new RequestPayment(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      mockDb.groupBy.mockResolvedValueOnce([{ price: "2500" }]);

      const adapter = new PostgresAdapter(requestEvent);
      const price = await adapter.price();

      expect(price).toBe(2500);
    });

    it("returns price for user with payment history", async () => {
      const requestEvent = new RequestPayment(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      mockDb.groupBy.mockResolvedValueOnce([{ price: "5000" }]);

      const adapter = new PostgresAdapter(requestEvent);
      const price = await adapter.price();

      expect(price).toBe(5000);
    });

    it("handles zero price correctly", async () => {
      const requestEvent = new RequestPayment(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      mockDb.groupBy.mockResolvedValueOnce([]);

      const adapter = new PostgresAdapter(requestEvent);
      const price = await adapter.price();

      expect(price).toBe(0);
    });

    it("handles large price values", async () => {
      const requestEvent = new RequestPayment(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      mockDb.groupBy.mockResolvedValueOnce([{ price: "999999999" }]);

      const adapter = new PostgresAdapter(requestEvent);
      const price = await adapter.price();

      expect(price).toBe(999999999);
    });

    it("handles negative prices", async () => {
      const requestEvent = new RequestPayment(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      mockDb.groupBy.mockResolvedValueOnce([{ price: "-1000" }]);

      const adapter = new PostgresAdapter(requestEvent);
      const price = await adapter.price();

      expect(price).toBe(-1000);
    });

    it("returns numeric price value", async () => {
      const requestEvent = new RequestPayment(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      mockDb.groupBy.mockResolvedValueOnce([{ price: "3500" }]);

      const adapter = new PostgresAdapter(requestEvent);
      const price = await adapter.price();

      expect(typeof price).toBe("number");
      expect(price).toBe(3500);
    });
  });

  describe("validation errors", () => {
    it("throws error when userId is missing", async () => {
      const invalidEvent = {
        type: "REQUEST_PAYMENT" as const,
        reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
        data: null,
        serialize: () => ({
          SQL: {
            type: "REQUEST_PAYMENT" as const,
            userId: undefined,
            reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
            data: null,
          },
        }),
      };

      const adapter = new PostgresAdapter(invalidEvent as any);
      await expect(adapter.price()).rejects.toThrow("Missing userId");
    });

    it("throws error when userId is empty string", async () => {
      const invalidEvent = {
        type: "REQUEST_PAYMENT" as const,
        userId: "",
        reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
        data: null,
        serialize: () => ({
          SQL: {
            type: "REQUEST_PAYMENT" as const,
            userId: "",
            reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
            data: null,
          },
        }),
      };

      const adapter = new PostgresAdapter(invalidEvent as any);
      await expect(adapter.price()).rejects.toThrow();
    });

    it("validates userId before processing", async () => {
      const invalidEvent = {
        type: "REQUEST_PAYMENT" as const,
        userId: null,
        reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
        data: null,
        serialize: () => ({
          SQL: {
            type: "REQUEST_PAYMENT" as const,
            userId: null,
            reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
            data: null,
          },
        }),
      };

      const adapter = new PostgresAdapter(invalidEvent as any);
      await expect(adapter.price()).rejects.toThrow();
    });
  });

  describe("database errors", () => {
    it("handles database query failure", async () => {
      const requestEvent = new RequestPayment(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      mockDb.groupBy.mockRejectedValueOnce(
        new Error("Database connection error"),
      );

      const adapter = new PostgresAdapter(requestEvent);
      await expect(adapter.price()).rejects.toThrow();
    });

    it("handles storage adapter factory failures", async () => {
      const requestEvent = new RequestPayment(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      vi.spyOn(factoryModule.StorageAdapterFactory, "getStorageAdapter").mockRejectedValueOnce(
        new Error("Factory failed"),
      );

      const adapter = new PostgresAdapter(requestEvent);
      await expect(adapter.price()).rejects.toThrow();
    });

    it("handles null storage adapter response", async () => {
      const requestEvent = new RequestPayment(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      vi.spyOn(factoryModule.StorageAdapterFactory, "getStorageAdapter").mockResolvedValueOnce(
        null as any,
      );

      const adapter = new PostgresAdapter(requestEvent);
      await expect(adapter.price()).rejects.toThrow();
    });

    it("handles invalid price return value", async () => {
      const requestEvent = new RequestPayment(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      mockDb.groupBy.mockResolvedValueOnce([{ price: "invalid" }]);

      const adapter = new PostgresAdapter(requestEvent);
      await expect(adapter.price()).rejects.toThrow();
    });
  });

  describe("edge cases", () => {
    it("handles new user with no history", async () => {
      const requestEvent = new RequestPayment(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      mockDb.groupBy.mockResolvedValueOnce([]);

      const adapter = new PostgresAdapter(requestEvent);
      const price = await adapter.price();

      expect(price).toBe(0);
    });

    it("handles null price in result", async () => {
      const requestEvent = new RequestPayment(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      mockDb.groupBy.mockResolvedValueOnce([{ price: null }]);

      const adapter = new PostgresAdapter(requestEvent);
      const price = await adapter.price();

      expect(price).toBe(0);
    });

    it("handles various user ID formats", async () => {
      const userIds = [
        "550e8400-e29b-41d4-a716-446655440000",
        "custom-user-id-456",
        "user_payment_123",
      ];

      for (const userId of userIds) {
        const requestEvent = new RequestPayment(userId, null);
        mockDb.groupBy.mockResolvedValueOnce([{ price: "200" }]);

        const adapter = new PostgresAdapter(requestEvent);
        const price = await adapter.price();

        expect(price).toBe(200);
      }
    });

    it("delegates to SDK call pricing logic", async () => {
      const requestEvent = new RequestPayment(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      mockDb.groupBy.mockResolvedValueOnce([{ price: "1234" }]);

      const adapter = new PostgresAdapter(requestEvent);
      const price = await adapter.price();

      // Verify the price is calculated using SDK call logic
      expect(price).toBe(1234);
      expect(mockDb.groupBy).toHaveBeenCalled();
    });

    it("handles concurrent price requests", async () => {
      const userId = "550e8400-e29b-41d4-a716-446655440000";
      const requestEvent1 = new RequestPayment(userId, null);
      const requestEvent2 = new RequestPayment(userId, null);

      mockDb.groupBy.mockResolvedValueOnce([{ price: "500" }]);
      mockDb.groupBy.mockResolvedValueOnce([{ price: "500" }]);

      const adapter1 = new PostgresAdapter(requestEvent1);
      const adapter2 = new PostgresAdapter(requestEvent2);

      const [price1, price2] = await Promise.all([
        adapter1.price(),
        adapter2.price(),
      ]);

      expect(price1).toBe(500);
      expect(price2).toBe(500);
    });
  });

  describe("integration with REQUEST_SDK_CALL", () => {
    it("uses REQUEST_SDK_CALL handler internally", async () => {
      const requestEvent = new RequestPayment(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      mockDb.groupBy.mockResolvedValueOnce([{ price: "7500" }]);

      const adapter = new PostgresAdapter(requestEvent);
      const price = await adapter.price();

      expect(price).toBe(7500);
      // The handler creates a RequestSDKCall internally and delegates
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalled();
    });

    it("inherits validation from SDK call handler", async () => {
      const invalidEvent = {
        type: "REQUEST_PAYMENT" as const,
        userId: "   ",
        reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
        data: null,
        serialize: () => ({
          SQL: {
            type: "REQUEST_PAYMENT" as const,
            userId: "   ",
            reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
            data: null,
          },
        }),
      };

      const adapter = new PostgresAdapter(invalidEvent as any);
      await expect(adapter.price()).rejects.toThrow();
    });
  });
});
