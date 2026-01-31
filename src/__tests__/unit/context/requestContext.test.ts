import { describe, it, expect, beforeEach } from "vitest";
import {
  WideEventBuilder,
  createWideEventBuilder,
  generateRequestId,
} from "../../../context/requestContext";

describe("requestContext", () => {
  describe("generateRequestId", () => {
    it("should generate a valid UUID v4", () => {
      const requestId = generateRequestId();

      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(requestId).toMatch(uuidRegex);
    });

    it("should generate unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateRequestId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe("WideEventBuilder", () => {
    let builder: WideEventBuilder;
    const requestId = "test-request-id-123";
    const method = "unary";
    const url = "https://api.example.com/event.v1.EventService/RegisterEvent";

    beforeEach(() => {
      builder = new WideEventBuilder(requestId, method, url);
    });

    it("should initialize with request metadata", () => {
      const event = builder.build();

      expect(event.requestId).toBe(requestId);
      expect(event.method).toBe(method);
      expect(event.path).toBe("/event.v1.EventService/RegisterEvent");
      expect(event.timestamp).toBeDefined();
      expect(event.env).toBeDefined();
    });

    it("should extract path from full URL", () => {
      const event = builder.build();
      expect(event.path).toBe("/event.v1.EventService/RegisterEvent");
    });

    it("should handle relative URLs", () => {
      const relativeBuilder = new WideEventBuilder(
        requestId,
        method,
        "/event.v1.EventService/RegisterEvent"
      );
      const event = relativeBuilder.build();
      expect(event.path).toBe("/event.v1.EventService/RegisterEvent");
    });

    describe("setAuth", () => {
      it("should set auth context with cache hit", () => {
        builder.setAuth("api-key-123", true);
        const event = builder.build();

        expect(event.apiKeyId).toBe("api-key-123");
        expect(event.cacheHit).toBe(true);
      });

      it("should set auth context with cache miss", () => {
        builder.setAuth("api-key-456", false);
        const event = builder.build();

        expect(event.apiKeyId).toBe("api-key-456");
        expect(event.cacheHit).toBe(false);
      });
    });

    describe("setUser", () => {
      it("should set user ID", () => {
        builder.setUser("user-789");
        const event = builder.build();

        expect(event.userId).toBe("user-789");
      });

      it("should support numeric user IDs", () => {
        builder.setUser(12345);
        const event = builder.build();

        expect(event.userId).toBe(12345);
      });
    });

    describe("setEventContext", () => {
      it("should set event type", () => {
        builder.setEventContext({ eventType: "SDK_CALL" });
        const event = builder.build();

        expect(event.eventType).toBe("SDK_CALL");
      });

      it("should set event count", () => {
        builder.setEventContext({ eventCount: 10 });
        const event = builder.build();

        expect(event.eventCount).toBe(10);
      });

      it("should set both", () => {
        builder.setEventContext({ eventType: "AI_TOKEN_USAGE", eventCount: 5 });
        const event = builder.build();

        expect(event.eventType).toBe("AI_TOKEN_USAGE");
        expect(event.eventCount).toBe(5);
      });
    });

    describe("setPaymentContext", () => {
      it("should set credit amount", () => {
        builder.setPaymentContext({ creditAmount: 5000 });
        const event = builder.build();

        expect(event.creditAmount).toBe(5000);
      });

      it("should set debit amount", () => {
        builder.setPaymentContext({ debitAmount: 100 });
        const event = builder.build();

        expect(event.debitAmount).toBe(100);
      });

      it("should set price amount", () => {
        builder.setPaymentContext({ priceAmount: 2500 });
        const event = builder.build();

        expect(event.priceAmount).toBe(2500);
      });
    });

    describe("setApiKeyContext", () => {
      it("should set API key name", () => {
        builder.setApiKeyContext({ name: "production-key" });
        const event = builder.build();

        expect(event.apiKeyName).toBe("production-key");
      });

      it("should set API key expiration", () => {
        builder.setApiKeyContext({ expiration: "2027-01-31T00:00:00.000Z" });
        const event = builder.build();

        expect(event.apiKeyExpiration).toBe("2027-01-31T00:00:00.000Z");
      });
    });

    describe("setWebhookContext", () => {
      it("should set webhook event", () => {
        builder.setWebhookContext({ webhookEvent: "order_created" });
        const event = builder.build();

        expect(event.webhookEvent).toBe("order_created");
      });

      it("should set order ID", () => {
        builder.setWebhookContext({ orderId: "order-123" });
        const event = builder.build();

        expect(event.orderId).toBe("order-123");
      });
    });

    describe("addContext", () => {
      it("should add arbitrary context", () => {
        builder.addContext({ customField: "custom-value", count: 42 });
        const event = builder.build();

        expect(event.customField).toBe("custom-value");
        expect(event.count).toBe(42);
      });
    });

    describe("setSuccess", () => {
      it("should set success outcome with default status code", () => {
        builder.setSuccess();
        const event = builder.build();

        expect(event.outcome).toBe("success");
        expect(event.statusCode).toBe(200);
      });

      it("should set success outcome with custom status code", () => {
        builder.setSuccess(201);
        const event = builder.build();

        expect(event.outcome).toBe("success");
        expect(event.statusCode).toBe(201);
      });
    });

    describe("setError", () => {
      it("should set error outcome with details", () => {
        builder.setError(400, {
          type: "VALIDATION_FAILED",
          message: "userId is required",
        });
        const event = builder.build();

        expect(event.outcome).toBe("error");
        expect(event.statusCode).toBe(400);
        expect(event.error?.type).toBe("VALIDATION_FAILED");
        expect(event.error?.message).toBe("userId is required");
      });

      it("should set error with cause", () => {
        builder.setError(500, {
          type: "DATABASE_ERROR",
          message: "Query failed",
          cause: "Connection timeout",
        });
        const event = builder.build();

        expect(event.error?.cause).toBe("Connection timeout");
      });
    });

    describe("build", () => {
      it("should calculate duration", async () => {
        // Wait a small amount to ensure some time passes
        await new Promise((resolve) => setTimeout(resolve, 10));
        const event = builder.build();

        expect(event.durationMs).toBeGreaterThanOrEqual(0);
      });

      it("should default outcome to success", () => {
        const event = builder.build();
        expect(event.outcome).toBe("success");
      });
    });

    describe("chaining", () => {
      it("should support method chaining", () => {
        const event = builder
          .setAuth("api-123", true)
          .setUser("user-456")
          .setEventContext({ eventType: "SDK_CALL" })
          .setSuccess(200)
          .build();

        expect(event.apiKeyId).toBe("api-123");
        expect(event.userId).toBe("user-456");
        expect(event.eventType).toBe("SDK_CALL");
        expect(event.outcome).toBe("success");
      });
    });
  });

  describe("createWideEventBuilder", () => {
    it("should create a new WideEventBuilder", () => {
      const builder = createWideEventBuilder("req-123", "POST", "/api/events");
      expect(builder).toBeInstanceOf(WideEventBuilder);
    });
  });
});
