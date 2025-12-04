import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PostgresAdapter } from "../../../../storage/adapter/postgres/postgres";
import { RequestSDKCall } from "../../../../events/RequestEvents/RequestSDKCall";
import * as dbModule from "../../../../storage/db/postgres/db";

describe("PostgresAdapter - priceRequestSdkCall handler", () => {
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
    it("calculates price for user with SDK call events", async () => {
      const requestEvent = new RequestSDKCall(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      mockDb.groupBy.mockResolvedValueOnce([{ price: "1500" }]);

      const adapter = new PostgresAdapter(requestEvent);
      const price = await adapter.price();

      expect(price).toBe(1500);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalled();
      expect(mockDb.leftJoin).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
      expect(mockDb.groupBy).toHaveBeenCalled();
    });

    it("returns zero for user with no SDK call events", async () => {
      const requestEvent = new RequestSDKCall(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      mockDb.groupBy.mockResolvedValueOnce([]);

      const adapter = new PostgresAdapter(requestEvent);
      const price = await adapter.price();

      expect(price).toBe(0);
    });

    it("returns zero when price is null", async () => {
      const requestEvent = new RequestSDKCall(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      mockDb.groupBy.mockResolvedValueOnce([{ price: null }]);

      const adapter = new PostgresAdapter(requestEvent);
      const price = await adapter.price();

      expect(price).toBe(0);
    });

    it("returns zero when price is undefined", async () => {
      const requestEvent = new RequestSDKCall(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      mockDb.groupBy.mockResolvedValueOnce([{ price: undefined }]);

      const adapter = new PostgresAdapter(requestEvent);
      const price = await adapter.price();

      expect(price).toBe(0);
    });

    it("handles large price values", async () => {
      const requestEvent = new RequestSDKCall(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      mockDb.groupBy.mockResolvedValueOnce([{ price: "999999999" }]);

      const adapter = new PostgresAdapter(requestEvent);
      const price = await adapter.price();

      expect(price).toBe(999999999);
    });

    it("handles negative price values (refunds)", async () => {
      const requestEvent = new RequestSDKCall(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      mockDb.groupBy.mockResolvedValueOnce([{ price: "-500" }]);

      const adapter = new PostgresAdapter(requestEvent);
      const price = await adapter.price();

      expect(price).toBe(-500);
    });

    it("handles zero price", async () => {
      const requestEvent = new RequestSDKCall(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      mockDb.groupBy.mockResolvedValueOnce([{ price: "0" }]);

      const adapter = new PostgresAdapter(requestEvent);
      const price = await adapter.price();

      expect(price).toBe(0);
    });

    it("parses string price to integer", async () => {
      const requestEvent = new RequestSDKCall(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      mockDb.groupBy.mockResolvedValueOnce([{ price: "12345" }]);

      const adapter = new PostgresAdapter(requestEvent);
      const price = await adapter.price();

      expect(typeof price).toBe("number");
      expect(price).toBe(12345);
    });
  });

  describe("validation errors", () => {
    it("throws error when userId is missing", async () => {
      const invalidEvent = {
        type: "REQUEST_SDK_CALL" as const,
        reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
        data: null,
        serialize: () => ({
          SQL: {
            type: "REQUEST_SDK_CALL" as const,
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
        type: "REQUEST_SDK_CALL" as const,
        userId: "   ",
        reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
        data: null,
        serialize: () => ({
          SQL: {
            type: "REQUEST_SDK_CALL" as const,
            userId: "   ",
            reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
            data: null,
          },
        }),
      };

      const adapter = new PostgresAdapter(invalidEvent as any);
      await expect(adapter.price()).rejects.toThrow("Invalid userId format");
    });

    it("throws error when userId is not a string", async () => {
      const invalidEvent = {
        type: "REQUEST_SDK_CALL" as const,
        userId: 12345,
        reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
        data: null,
        serialize: () => ({
          SQL: {
            type: "REQUEST_SDK_CALL" as const,
            userId: 12345,
            reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
            data: null,
          },
        }),
      };

      const adapter = new PostgresAdapter(invalidEvent as any);
      await expect(adapter.price()).rejects.toThrow("Invalid userId format");
    });
  });

  describe("database errors", () => {
    it("handles database query failure", async () => {
      const requestEvent = new RequestSDKCall(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      mockDb.groupBy.mockRejectedValueOnce(
        new Error("Database connection error"),
      );

      const adapter = new PostgresAdapter(requestEvent);
      await expect(adapter.price()).rejects.toThrow();
    });

    it("handles null query result", async () => {
      const requestEvent = new RequestSDKCall(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      mockDb.groupBy.mockResolvedValueOnce(null);

      const adapter = new PostgresAdapter(requestEvent);
      await expect(adapter.price()).rejects.toThrow(
        "Price query returned null",
      );
    });

    it("handles non-array query result", async () => {
      const requestEvent = new RequestSDKCall(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      mockDb.groupBy.mockResolvedValueOnce({ price: "1500" });

      const adapter = new PostgresAdapter(requestEvent);
      await expect(adapter.price()).rejects.toThrow(
        "Query result is not an array",
      );
    });
  });

  describe("edge cases", () => {
    it("handles empty array result", async () => {
      const requestEvent = new RequestSDKCall(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      mockDb.groupBy.mockResolvedValueOnce([]);

      const adapter = new PostgresAdapter(requestEvent);
      const price = await adapter.price();

      expect(price).toBe(0);
    });

    it("handles result with undefined first element", async () => {
      const requestEvent = new RequestSDKCall(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      mockDb.groupBy.mockResolvedValueOnce([undefined]);

      const adapter = new PostgresAdapter(requestEvent);
      const price = await adapter.price();

      expect(price).toBe(0);
    });

    it("handles various user ID formats", async () => {
      const userIds = [
        "550e8400-e29b-41d4-a716-446655440000",
        "custom-user-id-123",
        "user_123",
      ];

      for (const userId of userIds) {
        const requestEvent = new RequestSDKCall(userId, null);
        mockDb.groupBy.mockResolvedValueOnce([{ price: "100" }]);

        const adapter = new PostgresAdapter(requestEvent);
        const price = await adapter.price();

        expect(price).toBe(100);
      }
    });

    it("handles decimal price values by converting to integer", async () => {
      const requestEvent = new RequestSDKCall(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      // parseInt will truncate decimal values
      mockDb.groupBy.mockResolvedValueOnce([{ price: "1500.75" }]);

      const adapter = new PostgresAdapter(requestEvent);
      const price = await adapter.price();

      expect(price).toBe(1500);
    });
  });
});
