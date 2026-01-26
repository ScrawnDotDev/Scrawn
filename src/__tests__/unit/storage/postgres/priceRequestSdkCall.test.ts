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
        null
      );

      mockDb.groupBy.mockResolvedValueOnce([{ price: "1500" }]);

      const adapter = new PostgresAdapter(requestEvent);
      const serialized = requestEvent.serialize();
      const price = await adapter.price(serialized);

      expect(price).toBe(1500);
    });

    it("returns zero for user with no SDK call events", async () => {
      const requestEvent = new RequestSDKCall(
        "550e8400-e29b-41d4-a716-446655440000",
        null
      );

      mockDb.groupBy.mockResolvedValueOnce([]);

      const adapter = new PostgresAdapter(requestEvent);
      const serialized = requestEvent.serialize();
      const price = await adapter.price(serialized);

      expect(price).toBe(0);
    });

    it("returns zero when price is null", async () => {
      const requestEvent = new RequestSDKCall(
        "550e8400-e29b-41d4-a716-446655440000",
        null
      );

      mockDb.groupBy.mockResolvedValueOnce([{ price: null }]);

      const adapter = new PostgresAdapter(requestEvent);
      const serialized = requestEvent.serialize();
      const price = await adapter.price(serialized);

      expect(price).toBe(0);
    });

    it("parses string price to integer", async () => {
      const requestEvent = new RequestSDKCall(
        "550e8400-e29b-41d4-a716-446655440000",
        null
      );

      mockDb.groupBy.mockResolvedValueOnce([{ price: "12345" }]);

      const adapter = new PostgresAdapter(requestEvent);
      const serialized = requestEvent.serialize();
      const price = await adapter.price(serialized);

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
      const serialized = invalidEvent.serialize() as any;
      await expect(adapter.price(serialized)).rejects.toThrow("Missing userId");
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
      const serialized = invalidEvent.serialize() as any;
      await expect(adapter.price(serialized)).rejects.toThrow(
        "Invalid userId format"
      );
    });
  });

  describe("database errors", () => {
    it("handles database query failure", async () => {
      const requestEvent = new RequestSDKCall(
        "550e8400-e29b-41d4-a716-446655440000",
        null
      );

      mockDb.groupBy.mockRejectedValueOnce(
        new Error("Database connection error")
      );

      const adapter = new PostgresAdapter(requestEvent);
      const serialized = requestEvent.serialize();
      await expect(adapter.price(serialized)).rejects.toThrow();
    });

    it("handles null query result", async () => {
      const requestEvent = new RequestSDKCall(
        "550e8400-e29b-41d4-a716-446655440000",
        null
      );

      mockDb.groupBy.mockResolvedValueOnce(null);

      const adapter = new PostgresAdapter(requestEvent);
      const serialized = requestEvent.serialize();
      await expect(adapter.price(serialized)).rejects.toThrow(
        "Price query returned null"
      );
    });

    it("handles non-array query result", async () => {
      const requestEvent = new RequestSDKCall(
        "550e8400-e29b-41d4-a716-446655440000",
        null
      );

      mockDb.groupBy.mockResolvedValueOnce({ price: "1500" });

      const adapter = new PostgresAdapter(requestEvent);
      const serialized = requestEvent.serialize();
      await expect(adapter.price(serialized)).rejects.toThrow(
        "Query result is not an array"
      );
    });
  });
});
