import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PostgresAdapter } from "../../../../storage/adapter/postgres/postgres";
import { RequestAITokenUsage } from "../../../../events/RequestEvents/RequestAITokenUsage";
import * as dbModule from "../../../../storage/db/postgres/db";

describe("PostgresAdapter - priceRequestAiTokenUsage handler", () => {
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
    it("calculates price for user with AI token usage events", async () => {
      const requestEvent = new RequestAITokenUsage(
        "550e8400-e29b-41d4-a716-446655440000",
        null
      );

      mockDb.groupBy.mockResolvedValueOnce([{ price: "2500" }]);

      const adapter = new PostgresAdapter(requestEvent);
      const serialized = requestEvent.serialize();
      const price = await adapter.price(serialized);

      expect(price).toBe(2500);
    });

    it("returns zero for user with no AI token usage events", async () => {
      const requestEvent = new RequestAITokenUsage(
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
      const requestEvent = new RequestAITokenUsage(
        "550e8400-e29b-41d4-a716-446655440000",
        null
      );

      mockDb.groupBy.mockResolvedValueOnce([{ price: null }]);

      const adapter = new PostgresAdapter(requestEvent);
      const serialized = requestEvent.serialize();
      const price = await adapter.price(serialized);

      expect(price).toBe(0);
    });

    it("returns zero when price is undefined", async () => {
      const requestEvent = new RequestAITokenUsage(
        "550e8400-e29b-41d4-a716-446655440000",
        null
      );

      mockDb.groupBy.mockResolvedValueOnce([{ price: undefined }]);

      const adapter = new PostgresAdapter(requestEvent);
      const serialized = requestEvent.serialize();
      const price = await adapter.price(serialized);

      expect(price).toBe(0);
    });

    it("parses string price to integer", async () => {
      const requestEvent = new RequestAITokenUsage(
        "550e8400-e29b-41d4-a716-446655440000",
        null
      );

      mockDb.groupBy.mockResolvedValueOnce([{ price: "54321" }]);

      const adapter = new PostgresAdapter(requestEvent);
      const serialized = requestEvent.serialize();
      const price = await adapter.price(serialized);

      expect(typeof price).toBe("number");
      expect(price).toBe(54321);
    });

    it("handles large price values", async () => {
      const requestEvent = new RequestAITokenUsage(
        "550e8400-e29b-41d4-a716-446655440000",
        null
      );

      mockDb.groupBy.mockResolvedValueOnce([{ price: "999999999" }]);

      const adapter = new PostgresAdapter(requestEvent);
      const serialized = requestEvent.serialize();
      const price = await adapter.price(serialized);

      expect(price).toBe(999999999);
    });
  });

  describe("validation errors", () => {
    it("throws error when userId is missing", async () => {
      const invalidEvent = {
        type: "REQUEST_AI_TOKEN_USAGE" as const,
        reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
        data: null,
        serialize: () => ({
          SQL: {
            type: "REQUEST_AI_TOKEN_USAGE" as const,
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
        type: "REQUEST_AI_TOKEN_USAGE" as const,
        userId: "   ",
        reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
        data: null,
        serialize: () => ({
          SQL: {
            type: "REQUEST_AI_TOKEN_USAGE" as const,
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

    it("throws error when userId is not a string", async () => {
      const invalidEvent = {
        type: "REQUEST_AI_TOKEN_USAGE" as const,
        userId: 12345,
        reported_timestamp: { toISO: () => "2024-01-01T00:00:00.000Z" },
        data: null,
        serialize: () => ({
          SQL: {
            type: "REQUEST_AI_TOKEN_USAGE" as const,
            userId: 12345,
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
      const requestEvent = new RequestAITokenUsage(
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
      const requestEvent = new RequestAITokenUsage(
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
      const requestEvent = new RequestAITokenUsage(
        "550e8400-e29b-41d4-a716-446655440000",
        null
      );

      mockDb.groupBy.mockResolvedValueOnce({ price: "2500" });

      const adapter = new PostgresAdapter(requestEvent);
      const serialized = requestEvent.serialize();
      await expect(adapter.price(serialized)).rejects.toThrow(
        "Query result is not an array"
      );
    });

    it("handles unparseable price value", async () => {
      const requestEvent = new RequestAITokenUsage(
        "550e8400-e29b-41d4-a716-446655440000",
        null
      );

      mockDb.groupBy.mockResolvedValueOnce([{ price: "not-a-number" }]);

      const adapter = new PostgresAdapter(requestEvent);
      const serialized = requestEvent.serialize();
      await expect(adapter.price(serialized)).rejects.toThrow();
    });
  });

  describe("edge cases", () => {
    it("handles empty result array", async () => {
      const requestEvent = new RequestAITokenUsage(
        "550e8400-e29b-41d4-a716-446655440000",
        null
      );

      mockDb.groupBy.mockResolvedValueOnce([]);

      const adapter = new PostgresAdapter(requestEvent);
      const serialized = requestEvent.serialize();
      const price = await adapter.price(serialized);

      expect(price).toBe(0);
    });

    it("handles result array with undefined first element", async () => {
      const requestEvent = new RequestAITokenUsage(
        "550e8400-e29b-41d4-a716-446655440000",
        null
      );

      mockDb.groupBy.mockResolvedValueOnce([undefined]);

      const adapter = new PostgresAdapter(requestEvent);
      const serialized = requestEvent.serialize();
      const price = await adapter.price(serialized);

      expect(price).toBe(0);
    });

    it("handles zero price", async () => {
      const requestEvent = new RequestAITokenUsage(
        "550e8400-e29b-41d4-a716-446655440000",
        null
      );

      mockDb.groupBy.mockResolvedValueOnce([{ price: "0" }]);

      const adapter = new PostgresAdapter(requestEvent);
      const serialized = requestEvent.serialize();
      const price = await adapter.price(serialized);

      expect(price).toBe(0);
    });

    it("handles negative price (logs warning but returns value)", async () => {
      const requestEvent = new RequestAITokenUsage(
        "550e8400-e29b-41d4-a716-446655440000",
        null
      );

      mockDb.groupBy.mockResolvedValueOnce([{ price: "-100" }]);

      const adapter = new PostgresAdapter(requestEvent);
      const serialized = requestEvent.serialize();
      const price = await adapter.price(serialized);

      expect(price).toBe(-100);
    });
  });
});
