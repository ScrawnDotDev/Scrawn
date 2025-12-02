import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StorageAdapterFactory } from "../../../factory/StorageAdapterFactory";
import { SDKCall } from "../../../events/RawEvents/SDKCall";
import { Payment } from "../../../events/RawEvents/Payment";
import { AddKey } from "../../../events/RawEvents/AddKey";
import { RequestPayment } from "../../../events/RequestEvents/RequestPayment";
import { RequestSDKCall } from "../../../events/RequestEvents/RequestSDKCall";
import { DateTime } from "luxon";
import * as dbModule from "../../../storage/db/postgres/db";

describe("StorageAdapterFactory", () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: "test-id" }]),
  };

  beforeEach(() => {
    vi.spyOn(dbModule, "getPostgresDB").mockReturnValue(mockDb as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getStorageAdapter", () => {
    it("throws error for unknown event type", async () => {
      const unknownEvent = {
        type: "UNKNOWN_EVENT" as any,
        reported_timestamp: DateTime.utc(),
        data: {},
        serialize: () => ({ SQL: {} }),
      };

      await expect(
        StorageAdapterFactory.getStorageAdapter(unknownEvent as any),
      ).rejects.toThrow("Unknown event type");
    });
  });

  describe("Event Classes", () => {
    describe("SDKCall", () => {
      it("serializes SDK_CALL event correctly for RAW type", () => {
        const userId = "550e8400-e29b-41d4-a716-446655440000";
        const eventData = {
          sdkCallType: "RAW" as const,
          debitAmount: 1000,
        };

        const event = new SDKCall(userId, eventData);
        const serialized = event.serialize();

        expect(serialized).toHaveProperty("SQL");
        expect(serialized.SQL.type).toBe("SDK_CALL");
        expect(serialized.SQL.userId).toBe(userId);
        expect(serialized.SQL.data).toEqual(eventData);
        expect(serialized.SQL.reported_timestamp).toBeInstanceOf(DateTime);
      });

      it("serializes SDK_CALL event correctly for MIDDLEWARE_CALL type", () => {
        const userId = "550e8400-e29b-41d4-a716-446655440000";
        const eventData = {
          sdkCallType: "MIDDLEWARE_CALL" as const,
          debitAmount: 2000,
        };

        const event = new SDKCall(userId, eventData);
        const serialized = event.serialize();

        expect(serialized).toHaveProperty("SQL");
        expect(serialized.SQL.type).toBe("SDK_CALL");
        expect(serialized.SQL.userId).toBe(userId);
        expect(serialized.SQL.data).toEqual(eventData);
        expect(serialized.SQL.reported_timestamp).toBeInstanceOf(DateTime);
      });

      it("sets reported_timestamp to current UTC time", () => {
        const beforeCreation = DateTime.utc();
        const event = new SDKCall("550e8400-e29b-41d4-a716-446655440000", {
          sdkCallType: "RAW",
          debitAmount: 1000,
        });
        const afterCreation = DateTime.utc();

        expect(event.reported_timestamp.toMillis()).toBeGreaterThanOrEqual(
          beforeCreation.toMillis(),
        );
        expect(event.reported_timestamp.toMillis()).toBeLessThanOrEqual(
          afterCreation.toMillis(),
        );
      });
    });

    describe("Payment", () => {
      it("serializes PAYMENT event correctly", () => {
        const userId = "550e8400-e29b-41d4-a716-446655440000";
        const eventData = {
          creditAmount: 10000,
        };

        const event = new Payment(userId, eventData);
        const serialized = event.serialize();

        expect(serialized).toHaveProperty("SQL");
        expect(serialized.SQL.type).toBe("PAYMENT");
        expect(serialized.SQL.userId).toBe(userId);
        expect(serialized.SQL.data).toEqual(eventData);
        expect(serialized.SQL.reported_timestamp).toBeInstanceOf(DateTime);
      });
    });

    describe("AddKey", () => {
      it("serializes ADD_KEY event correctly", () => {
        const eventData = {
          name: "Test Key",
          key: "scrn_test_12345678901234567890",
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        };

        const event = new AddKey(eventData);
        const serialized = event.serialize();

        expect(serialized).toHaveProperty("SQL");
        expect(serialized.SQL.type).toBe("ADD_KEY");
        expect(serialized.SQL.data).toEqual(eventData);
        expect(serialized.SQL.reported_timestamp).toBeInstanceOf(DateTime);
        expect(serialized.SQL).not.toHaveProperty("userId");
      });

      it("handles keys with special characters in name", () => {
        const eventData = {
          name: "Dev Key #1 (Main)",
          key: "scrn_dev_12345678901234567890",
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        };

        const event = new AddKey(eventData);

        expect(event.data.name).toBe("Dev Key #1 (Main)");
      });
    });

    describe("RequestPayment", () => {
      it("serializes REQUEST_PAYMENT event correctly", () => {
        const userId = "550e8400-e29b-41d4-a716-446655440000";

        const event = new RequestPayment(userId, null);
        const serialized = event.serialize();

        expect(serialized).toHaveProperty("SQL");
        expect(serialized.SQL.type).toBe("REQUEST_PAYMENT");
        expect(serialized.SQL.userId).toBe(userId);
        expect(serialized.SQL.data).toBeNull();
        expect(serialized.SQL.reported_timestamp).toBeInstanceOf(DateTime);
      });

      it("accepts any string as userId", () => {
        const event = new RequestPayment("custom-user-id-123", null);

        expect(event.userId).toBe("custom-user-id-123");
      });
    });

    describe("RequestSDKCall", () => {
      it("serializes REQUEST_SDK_CALL event correctly", () => {
        const userId = "550e8400-e29b-41d4-a716-446655440000";

        const event = new RequestSDKCall(userId, null);
        const serialized = event.serialize();

        expect(serialized).toHaveProperty("SQL");
        expect(serialized.SQL.type).toBe("REQUEST_SDK_CALL");
        expect(serialized.SQL.userId).toBe(userId);
        expect(serialized.SQL.data).toBeNull();
        expect(serialized.SQL.reported_timestamp).toBeInstanceOf(DateTime);
      });

      it("accepts any string as userId", () => {
        const event = new RequestSDKCall("custom-user-id-456", null);

        expect(event.userId).toBe("custom-user-id-456");
      });
    });
  });

  describe("Event Integration with StorageAdapterFactory", () => {
    it("verifies all event types can serialize properly", () => {
      const sdkCall = new SDKCall("550e8400-e29b-41d4-a716-446655440000", {
        sdkCallType: "RAW",
        debitAmount: 1000,
      });
      const payment = new Payment("550e8400-e29b-41d4-a716-446655440000", {
        creditAmount: 5000,
      });
      const addKey = new AddKey({
        name: "Test",
        key: "scrn_test_12345678901234567890",
        expiresAt: new Date().toISOString(),
      });
      const requestPayment = new RequestPayment(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );
      const requestSDKCall = new RequestSDKCall(
        "550e8400-e29b-41d4-a716-446655440000",
        null,
      );

      const events = [sdkCall, payment, addKey, requestPayment, requestSDKCall];

      events.forEach((event) => {
        const serialized = event.serialize();
        expect(serialized).toHaveProperty("SQL");
        expect(serialized.SQL).toHaveProperty("type");
        expect(serialized.SQL).toHaveProperty("reported_timestamp");
        expect(serialized.SQL).toHaveProperty("data");
      });
    });
  });
});
