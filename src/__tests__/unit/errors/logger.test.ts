import { describe, it, expect } from "vitest";
import type { WideEvent } from "../../../errors/logger";

describe("WideEvent interface", () => {
  describe("WideEvent structure", () => {
    it("should have required fields", () => {
      const event: WideEvent = {
        requestId: "test-request-id",
        method: "unary",
        path: "/event.v1.EventService/RegisterEvent",
        timestamp: "2026-01-31T10:00:00.000Z",
        env: "test",
        outcome: "success",
        durationMs: 50,
      };

      expect(event.requestId).toBe("test-request-id");
      expect(event.method).toBe("unary");
      expect(event.path).toBe("/event.v1.EventService/RegisterEvent");
      expect(event.timestamp).toBe("2026-01-31T10:00:00.000Z");
      expect(event.env).toBe("test");
      expect(event.outcome).toBe("success");
      expect(event.durationMs).toBe(50);
    });

    it("should support success outcome", () => {
      const event: WideEvent = {
        requestId: "test-id",
        method: "POST",
        path: "/test",
        timestamp: new Date().toISOString(),
        env: "test",
        outcome: "success",
        durationMs: 100,
        statusCode: 200,
      };

      expect(event.outcome).toBe("success");
      expect(event.statusCode).toBe(200);
    });

    it("should support error outcome with error details", () => {
      const event: WideEvent = {
        requestId: "test-id",
        method: "POST",
        path: "/test",
        timestamp: new Date().toISOString(),
        env: "test",
        outcome: "error",
        durationMs: 25,
        statusCode: 400,
        error: {
          type: "VALIDATION_FAILED",
          message: "userId: Required",
        },
      };

      expect(event.outcome).toBe("error");
      expect(event.statusCode).toBe(400);
      expect(event.error?.type).toBe("VALIDATION_FAILED");
      expect(event.error?.message).toBe("userId: Required");
    });

    it("should support auth context", () => {
      const event: WideEvent = {
        requestId: "test-id",
        method: "POST",
        path: "/test",
        timestamp: new Date().toISOString(),
        env: "test",
        outcome: "success",
        durationMs: 50,
        apiKeyId: "api-key-123",
        cacheHit: true,
      };

      expect(event.apiKeyId).toBe("api-key-123");
      expect(event.cacheHit).toBe(true);
    });

    it("should support user and event context", () => {
      const event: WideEvent = {
        requestId: "test-id",
        method: "POST",
        path: "/test",
        timestamp: new Date().toISOString(),
        env: "test",
        outcome: "success",
        durationMs: 50,
        userId: "user-456",
        eventType: "SDK_CALL",
        eventCount: 5,
      };

      expect(event.userId).toBe("user-456");
      expect(event.eventType).toBe("SDK_CALL");
      expect(event.eventCount).toBe(5);
    });

    it("should support payment context", () => {
      const event: WideEvent = {
        requestId: "test-id",
        method: "POST",
        path: "/test",
        timestamp: new Date().toISOString(),
        env: "test",
        outcome: "success",
        durationMs: 50,
        creditAmount: 5000,
        debitAmount: 100,
        priceAmount: 2500,
      };

      expect(event.creditAmount).toBe(5000);
      expect(event.debitAmount).toBe(100);
      expect(event.priceAmount).toBe(2500);
    });

    it("should support API key context", () => {
      const event: WideEvent = {
        requestId: "test-id",
        method: "POST",
        path: "/test",
        timestamp: new Date().toISOString(),
        env: "test",
        outcome: "success",
        durationMs: 50,
        apiKeyName: "production-key",
        apiKeyExpiration: "2027-01-31T00:00:00.000Z",
      };

      expect(event.apiKeyName).toBe("production-key");
      expect(event.apiKeyExpiration).toBe("2027-01-31T00:00:00.000Z");
    });

    it("should support webhook context", () => {
      const event: WideEvent = {
        requestId: "test-id",
        method: "POST",
        path: "/test",
        timestamp: new Date().toISOString(),
        env: "test",
        outcome: "success",
        durationMs: 50,
        webhookEvent: "order_created",
        orderId: "order-123",
      };

      expect(event.webhookEvent).toBe("order_created");
      expect(event.orderId).toBe("order-123");
    });

    it("should support extensible fields", () => {
      const event: WideEvent = {
        requestId: "test-id",
        method: "POST",
        path: "/test",
        timestamp: new Date().toISOString(),
        env: "test",
        outcome: "success",
        durationMs: 50,
        customField: "custom-value",
        anotherField: 42,
      };

      expect(event.customField).toBe("custom-value");
      expect(event.anotherField).toBe(42);
    });
  });
});
