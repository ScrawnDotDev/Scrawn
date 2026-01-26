import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handlePriceRequestPayment } from "../../../../storage/adapter/postgres/handlers/priceRequestPayment";
import { StorageAdapterFactory } from "../../../../factory";
import type { SqlRecord } from "../../../../interface/event/Event";

describe("PostgresAdapter - priceRequestPayment handler", () => {
  let mockSdkAdapter: any;
  let mockAiAdapter: any;

  beforeEach(() => {
    mockSdkAdapter = {
      price: vi.fn(),
    };

    mockAiAdapter = {
      price: vi.fn(),
    };

    vi.spyOn(StorageAdapterFactory, "getStorageAdapter").mockImplementation(
      (event: any) => {
        if (event.type === "REQUEST_SDK_CALL") {
          return Promise.resolve(mockSdkAdapter);
        }
        if (event.type === "REQUEST_AI_TOKEN_USAGE") {
          return Promise.resolve(mockAiAdapter);
        }
        return Promise.resolve(null);
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("successful operations", () => {
    it("calculates total price by summing SDK and AI prices", async () => {
      const eventData: SqlRecord<"REQUEST_PAYMENT"> = {
        type: "REQUEST_PAYMENT",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: {} as any,
        data: null,
      };

      mockSdkAdapter.price.mockResolvedValueOnce(1500);
      mockAiAdapter.price.mockResolvedValueOnce(2500);

      const totalPrice = await handlePriceRequestPayment(eventData);

      expect(totalPrice).toBe(4000);
      expect(mockSdkAdapter.price).toHaveBeenCalledTimes(1);
      expect(mockAiAdapter.price).toHaveBeenCalledTimes(1);
    });

    it("handles zero SDK price", async () => {
      const eventData: SqlRecord<"REQUEST_PAYMENT"> = {
        type: "REQUEST_PAYMENT",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: {} as any,
        data: null,
      };

      mockSdkAdapter.price.mockResolvedValueOnce(0);
      mockAiAdapter.price.mockResolvedValueOnce(3000);

      const totalPrice = await handlePriceRequestPayment(eventData);

      expect(totalPrice).toBe(3000);
    });

    it("handles zero AI price", async () => {
      const eventData: SqlRecord<"REQUEST_PAYMENT"> = {
        type: "REQUEST_PAYMENT",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: {} as any,
        data: null,
      };

      mockSdkAdapter.price.mockResolvedValueOnce(2000);
      mockAiAdapter.price.mockResolvedValueOnce(0);

      const totalPrice = await handlePriceRequestPayment(eventData);

      expect(totalPrice).toBe(2000);
    });

    it("handles both prices being zero", async () => {
      const eventData: SqlRecord<"REQUEST_PAYMENT"> = {
        type: "REQUEST_PAYMENT",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: {} as any,
        data: null,
      };

      mockSdkAdapter.price.mockResolvedValueOnce(0);
      mockAiAdapter.price.mockResolvedValueOnce(0);

      const totalPrice = await handlePriceRequestPayment(eventData);

      expect(totalPrice).toBe(0);
    });

    it("handles large price values", async () => {
      const eventData: SqlRecord<"REQUEST_PAYMENT"> = {
        type: "REQUEST_PAYMENT",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: {} as any,
        data: null,
      };

      mockSdkAdapter.price.mockResolvedValueOnce(999999);
      mockAiAdapter.price.mockResolvedValueOnce(888888);

      const totalPrice = await handlePriceRequestPayment(eventData);

      expect(totalPrice).toBe(1888887);
    });
  });

  describe("validation errors", () => {
    it("throws error when userId is missing", async () => {
      const eventData = {
        type: "REQUEST_PAYMENT" as const,
        reported_timestamp: {} as any,
        data: null,
      } as any;

      await expect(handlePriceRequestPayment(eventData)).rejects.toThrow(
        "Missing userId"
      );
    });

    it("throws error when userId is undefined", async () => {
      const eventData: SqlRecord<"REQUEST_PAYMENT"> = {
        type: "REQUEST_PAYMENT",
        userId: undefined as any,
        reported_timestamp: {} as any,
        data: null,
      };

      await expect(handlePriceRequestPayment(eventData)).rejects.toThrow(
        "Missing userId"
      );
    });
  });

  describe("storage adapter errors", () => {
    it("throws error when SDK storage adapter is null", async () => {
      const eventData: SqlRecord<"REQUEST_PAYMENT"> = {
        type: "REQUEST_PAYMENT",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: {} as any,
        data: null,
      };

      vi.spyOn(StorageAdapterFactory, "getStorageAdapter").mockImplementation(
        (event: any) => {
          if (event.type === "REQUEST_SDK_CALL") {
            return Promise.resolve(null as any);
          }
          return Promise.resolve(mockAiAdapter);
        }
      );

      await expect(handlePriceRequestPayment(eventData)).rejects.toThrow();
    });

    it("throws error when AI storage adapter is null", async () => {
      const eventData: SqlRecord<"REQUEST_PAYMENT"> = {
        type: "REQUEST_PAYMENT",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: {} as any,
        data: null,
      };

      mockSdkAdapter.price.mockResolvedValueOnce(1500);

      vi.spyOn(StorageAdapterFactory, "getStorageAdapter").mockImplementation(
        (event: any) => {
          if (event.type === "REQUEST_SDK_CALL") {
            return Promise.resolve(mockSdkAdapter);
          }
          if (event.type === "REQUEST_AI_TOKEN_USAGE") {
            return Promise.resolve(null as any);
          }
          return Promise.resolve(null);
        }
      );

      await expect(handlePriceRequestPayment(eventData)).rejects.toThrow();
    });

    it("throws error when SDK storage adapter is undefined", async () => {
      const eventData: SqlRecord<"REQUEST_PAYMENT"> = {
        type: "REQUEST_PAYMENT",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: {} as any,
        data: null,
      };

      vi.spyOn(StorageAdapterFactory, "getStorageAdapter").mockImplementation(
        (event: any) => {
          if (event.type === "REQUEST_SDK_CALL") {
            return Promise.resolve(undefined as any);
          }
          return Promise.resolve(mockAiAdapter);
        }
      );

      await expect(handlePriceRequestPayment(eventData)).rejects.toThrow();
    });
  });

  describe("price calculation errors", () => {
    it("throws error when SDK price is NaN", async () => {
      const eventData: SqlRecord<"REQUEST_PAYMENT"> = {
        type: "REQUEST_PAYMENT",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: {} as any,
        data: null,
      };

      mockSdkAdapter.price.mockResolvedValueOnce(NaN);

      await expect(handlePriceRequestPayment(eventData)).rejects.toThrow();
    });

    it("throws error when AI price is NaN", async () => {
      const eventData: SqlRecord<"REQUEST_PAYMENT"> = {
        type: "REQUEST_PAYMENT",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: {} as any,
        data: null,
      };

      mockSdkAdapter.price.mockResolvedValueOnce(1500);
      mockAiAdapter.price.mockResolvedValueOnce(NaN);

      await expect(handlePriceRequestPayment(eventData)).rejects.toThrow();
    });

    it("throws error when SDK price is not a number", async () => {
      const eventData: SqlRecord<"REQUEST_PAYMENT"> = {
        type: "REQUEST_PAYMENT",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: {} as any,
        data: null,
      };

      mockSdkAdapter.price.mockResolvedValueOnce("not-a-number" as any);

      await expect(handlePriceRequestPayment(eventData)).rejects.toThrow();
    });

    it("throws error when AI price is not a number", async () => {
      const eventData: SqlRecord<"REQUEST_PAYMENT"> = {
        type: "REQUEST_PAYMENT",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: {} as any,
        data: null,
      };

      mockSdkAdapter.price.mockResolvedValueOnce(1500);
      mockAiAdapter.price.mockResolvedValueOnce("not-a-number" as any);

      await expect(handlePriceRequestPayment(eventData)).rejects.toThrow();
    });

    it("throws error when SDK price returns null", async () => {
      const eventData: SqlRecord<"REQUEST_PAYMENT"> = {
        type: "REQUEST_PAYMENT",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: {} as any,
        data: null,
      };

      mockSdkAdapter.price.mockResolvedValueOnce(null);

      await expect(handlePriceRequestPayment(eventData)).rejects.toThrow();
    });

    it("throws error when AI price returns null", async () => {
      const eventData: SqlRecord<"REQUEST_PAYMENT"> = {
        type: "REQUEST_PAYMENT",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: {} as any,
        data: null,
      };

      mockSdkAdapter.price.mockResolvedValueOnce(1500);
      mockAiAdapter.price.mockResolvedValueOnce(null);

      await expect(handlePriceRequestPayment(eventData)).rejects.toThrow();
    });
  });

  describe("adapter method errors", () => {
    it("handles SDK adapter price method throwing error", async () => {
      const eventData: SqlRecord<"REQUEST_PAYMENT"> = {
        type: "REQUEST_PAYMENT",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: {} as any,
        data: null,
      };

      mockSdkAdapter.price.mockRejectedValueOnce(
        new Error("Database connection failed")
      );

      await expect(handlePriceRequestPayment(eventData)).rejects.toThrow();
    });

    it("handles AI adapter price method throwing error", async () => {
      const eventData: SqlRecord<"REQUEST_PAYMENT"> = {
        type: "REQUEST_PAYMENT",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: {} as any,
        data: null,
      };

      mockSdkAdapter.price.mockResolvedValueOnce(1500);
      mockAiAdapter.price.mockRejectedValueOnce(new Error("Query timeout"));

      await expect(handlePriceRequestPayment(eventData)).rejects.toThrow();
    });

    it("wraps non-StorageError exceptions", async () => {
      const eventData: SqlRecord<"REQUEST_PAYMENT"> = {
        type: "REQUEST_PAYMENT",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: {} as any,
        data: null,
      };

      mockSdkAdapter.price.mockRejectedValueOnce(new Error("Unexpected error"));

      await expect(handlePriceRequestPayment(eventData)).rejects.toThrow();
    });
  });

  describe("edge cases", () => {
    it("handles negative SDK price", async () => {
      const eventData: SqlRecord<"REQUEST_PAYMENT"> = {
        type: "REQUEST_PAYMENT",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: {} as any,
        data: null,
      };

      mockSdkAdapter.price.mockResolvedValueOnce(-100);
      mockAiAdapter.price.mockResolvedValueOnce(200);

      const totalPrice = await handlePriceRequestPayment(eventData);

      expect(totalPrice).toBe(100);
    });

    it("handles negative AI price", async () => {
      const eventData: SqlRecord<"REQUEST_PAYMENT"> = {
        type: "REQUEST_PAYMENT",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: {} as any,
        data: null,
      };

      mockSdkAdapter.price.mockResolvedValueOnce(300);
      mockAiAdapter.price.mockResolvedValueOnce(-50);

      const totalPrice = await handlePriceRequestPayment(eventData);

      expect(totalPrice).toBe(250);
    });

    it("handles both negative prices", async () => {
      const eventData: SqlRecord<"REQUEST_PAYMENT"> = {
        type: "REQUEST_PAYMENT",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        reported_timestamp: {} as any,
        data: null,
      };

      mockSdkAdapter.price.mockResolvedValueOnce(-100);
      mockAiAdapter.price.mockResolvedValueOnce(-50);

      const totalPrice = await handlePriceRequestPayment(eventData);

      expect(totalPrice).toBe(-150);
    });
  });
});
