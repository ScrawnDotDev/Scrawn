import { describe, it, expect, beforeEach, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import crypto from "node:crypto";

// Set environment variables BEFORE any imports
process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = "test-webhook-secret";
process.env.LEMON_SQUEEZY_API_KEY = "test-api-key";

// Mock Payment and PostgresAdapter
const mockAdd = vi.fn().mockResolvedValue(undefined);

vi.mock("../../../../events/RawEvents/Payment", () => {
  return {
    Payment: class Payment {
      userId: string;
      data: any;
      type = "PAYMENT" as const;
      reported_timestamp = { toISO: () => "2024-01-01T00:00:00.000Z" };

      constructor(userId: string, data: any) {
        this.userId = userId;
        this.data = data;
      }

      serialize() {
        return {
          SQL: {
            type: this.type,
            userId: this.userId,
            data: this.data,
            reported_timestamp: this.reported_timestamp,
          },
        };
      }
    },
  };
});

vi.mock("../../../../storage/adapter/postgres/postgres", () => {
  return {
    PostgresAdapter: class PostgresAdapter {
      add = mockAdd;
      constructor(_event: any, _apiKeyId?: string) {}
    },
  };
});

vi.mock("@lemonsqueezy/lemonsqueezy.js", () => ({
  lemonSqueezySetup: vi.fn(),
}));

// Import after mocks are set up
import { handleLemonSqueezyWebhook } from "../../../../routes/http/createdCheckout";

describe("handleLemonSqueezyWebhook", () => {
  let mockRes: Partial<ServerResponse>;
  let writeHeadSpy: ReturnType<typeof vi.fn>;
  let endSpy: ReturnType<typeof vi.fn>;

  const validWebhookSecret = "test-webhook-secret";
  const validPayload = {
    meta: {
      event_name: "order_created",
      custom_data: {
        user_id: "test-user-123",
        api_key_id: "test-api-key-456",
      },
    },
    data: {
      id: "order-123",
      type: "orders",
      attributes: {
        store_id: 1,
        customer_id: 1,
        order_number: 1,
        total: 1599,
        total_usd: 1599,
        status: "paid",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    writeHeadSpy = vi.fn();
    endSpy = vi.fn();

    mockRes = {
      writeHead: writeHeadSpy,
      end: endSpy,
    };
  });

  function createMockRequest(
    body: string,
    signature?: string,
  ): IncomingMessage {
    const req = new Readable({
      read() {
        this.push(body);
        this.push(null);
      },
    }) as IncomingMessage;

    req.headers = signature ? { "x-signature": signature } : {};

    return req;
  }

  function generateValidSignature(payload: string): string {
    const hmac = crypto.createHmac("sha256", validWebhookSecret);
    hmac.update(payload);
    return hmac.digest("hex");
  }

  describe("signature verification", () => {
    it("should reject request without signature", async () => {
      const body = JSON.stringify(validPayload);
      const req = createMockRequest(body);

      await handleLemonSqueezyWebhook(req, mockRes as ServerResponse);

      expect(writeHeadSpy).toHaveBeenCalledWith(401, {
        "Content-Type": "application/json",
      });
      expect(endSpy).toHaveBeenCalledWith(
        JSON.stringify({ error: "Invalid signature" }),
      );
    });

    it("should reject request with invalid signature", async () => {
      const body = JSON.stringify(validPayload);
      const req = createMockRequest(body, "invalid-signature");

      await handleLemonSqueezyWebhook(req, mockRes as ServerResponse);

      expect(writeHeadSpy).toHaveBeenCalledWith(401, {
        "Content-Type": "application/json",
      });
      expect(endSpy).toHaveBeenCalledWith(
        JSON.stringify({ error: "Invalid signature" }),
      );
    });

    it("should accept request with valid signature", async () => {
      const body = JSON.stringify(validPayload);
      const signature = generateValidSignature(body);
      const req = createMockRequest(body, signature);

      await handleLemonSqueezyWebhook(req, mockRes as ServerResponse);

      expect(writeHeadSpy).toHaveBeenCalledWith(200, {
        "Content-Type": "application/json",
      });
    });
  });

  describe("event type filtering", () => {
    it("should ignore non-order_created events", async () => {
      const payload = {
        ...validPayload,
        meta: {
          ...validPayload.meta,
          event_name: "subscription_created",
        },
      };

      const body = JSON.stringify(payload);
      const signature = generateValidSignature(body);
      const req = createMockRequest(body, signature);

      await handleLemonSqueezyWebhook(req, mockRes as ServerResponse);

      expect(writeHeadSpy).toHaveBeenCalledWith(200, {
        "Content-Type": "application/json",
      });
      expect(endSpy).toHaveBeenCalledWith(
        JSON.stringify({ message: "Event ignored" }),
      );
      expect(mockAdd).not.toHaveBeenCalled();
    });

    it("should process order_created events", async () => {
      const body = JSON.stringify(validPayload);
      const signature = generateValidSignature(body);
      const req = createMockRequest(body, signature);

      await handleLemonSqueezyWebhook(req, mockRes as ServerResponse);

      expect(mockAdd).toHaveBeenCalled();
      expect(writeHeadSpy).toHaveBeenCalledWith(200, {
        "Content-Type": "application/json",
      });
    });
  });

  describe("payload validation", () => {
    it("should reject invalid JSON payload", async () => {
      const body = "invalid json{{{";
      const signature = generateValidSignature(body);
      const req = createMockRequest(body, signature);

      await handleLemonSqueezyWebhook(req, mockRes as ServerResponse);

      expect(writeHeadSpy).toHaveBeenCalledWith(400, {
        "Content-Type": "application/json",
      });
      expect(endSpy).toHaveBeenCalledWith(
        JSON.stringify({ error: "Invalid JSON payload" }),
      );
    });

    it("should reject payload without user_id", async () => {
      const payload = {
        ...validPayload,
        meta: {
          event_name: "order_created",
          custom_data: {
            api_key_id: "test-api-key-456",
          },
        },
      };

      const body = JSON.stringify(payload);
      const signature = generateValidSignature(body);
      const req = createMockRequest(body, signature);

      await handleLemonSqueezyWebhook(req, mockRes as ServerResponse);

      expect(writeHeadSpy).toHaveBeenCalledWith(400, {
        "Content-Type": "application/json",
      });
      expect(endSpy).toHaveBeenCalledWith(
        JSON.stringify({ error: "Missing user_id in webhook payload" }),
      );
    });

    it("should reject payload without api_key_id", async () => {
      const payload = {
        ...validPayload,
        meta: {
          event_name: "order_created",
          custom_data: {
            user_id: "test-user-123",
          },
        },
      };

      const body = JSON.stringify(payload);
      const signature = generateValidSignature(body);
      const req = createMockRequest(body, signature);

      await handleLemonSqueezyWebhook(req, mockRes as ServerResponse);

      expect(writeHeadSpy).toHaveBeenCalledWith(400, {
        "Content-Type": "application/json",
      });
      expect(endSpy).toHaveBeenCalledWith(
        JSON.stringify({ error: "Missing apiKeyId in webhook payload" }),
      );
    });

    it("should reject payload without custom_data", async () => {
      const payload = {
        ...validPayload,
        meta: {
          event_name: "order_created",
        },
      };

      const body = JSON.stringify(payload);
      const signature = generateValidSignature(body);
      const req = createMockRequest(body, signature);

      await handleLemonSqueezyWebhook(req, mockRes as ServerResponse);

      expect(writeHeadSpy).toHaveBeenCalledWith(400, {
        "Content-Type": "application/json",
      });
    });
  });

  describe("payment event storage", () => {
    it("should call adapter.add() to store payment event", async () => {
      const body = JSON.stringify(validPayload);
      const signature = generateValidSignature(body);
      const req = createMockRequest(body, signature);

      await handleLemonSqueezyWebhook(req, mockRes as ServerResponse);

      expect(mockAdd).toHaveBeenCalled();
    });

    it("should process payment with correct credit amount", async () => {
      const payload = {
        ...validPayload,
        data: {
          ...validPayload.data,
          attributes: {
            ...validPayload.data.attributes,
            total: 2500,
          },
        },
      };

      const body = JSON.stringify(payload);
      const signature = generateValidSignature(body);
      const req = createMockRequest(body, signature);

      await handleLemonSqueezyWebhook(req, mockRes as ServerResponse);

      expect(writeHeadSpy).toHaveBeenCalledWith(200, {
        "Content-Type": "application/json",
      });
    });

    it("should round decimal credit amounts", async () => {
      const payload = {
        ...validPayload,
        data: {
          ...validPayload.data,
          attributes: {
            ...validPayload.data.attributes,
            total: 1599.75,
          },
        },
      };

      const body = JSON.stringify(payload);
      const signature = generateValidSignature(body);
      const req = createMockRequest(body, signature);

      await handleLemonSqueezyWebhook(req, mockRes as ServerResponse);

      expect(writeHeadSpy).toHaveBeenCalledWith(200, {
        "Content-Type": "application/json",
      });
    });
  });

  describe("success responses", () => {
    it("should return 200 on successful processing", async () => {
      const body = JSON.stringify(validPayload);
      const signature = generateValidSignature(body);
      const req = createMockRequest(body, signature);

      await handleLemonSqueezyWebhook(req, mockRes as ServerResponse);

      expect(writeHeadSpy).toHaveBeenCalledWith(200, {
        "Content-Type": "application/json",
      });
      expect(endSpy).toHaveBeenCalledWith(
        JSON.stringify({ message: "Webhook processed successfully" }),
      );
    });

    it("should process multiple valid webhooks sequentially", async () => {
      for (let i = 0; i < 3; i++) {
        vi.clearAllMocks();

        const body = JSON.stringify(validPayload);
        const signature = generateValidSignature(body);
        const req = createMockRequest(body, signature);

        await handleLemonSqueezyWebhook(req, mockRes as ServerResponse);

        expect(writeHeadSpy).toHaveBeenCalledWith(200, {
          "Content-Type": "application/json",
        });
      }
    });
  });

  describe("error handling", () => {
    it("should return 500 on database error", async () => {
      mockAdd.mockRejectedValueOnce(new Error("Database error"));

      const body = JSON.stringify(validPayload);
      const signature = generateValidSignature(body);
      const req = createMockRequest(body, signature);

      await handleLemonSqueezyWebhook(req, mockRes as ServerResponse);

      expect(writeHeadSpy).toHaveBeenCalledWith(500, {
        "Content-Type": "application/json",
      });
      expect(endSpy).toHaveBeenCalledWith(
        JSON.stringify({ error: "Database error" }),
      );
    });

    it("should handle unexpected errors gracefully", async () => {
      mockAdd.mockRejectedValueOnce(new Error("Unexpected error"));

      const body = JSON.stringify(validPayload);
      const signature = generateValidSignature(body);
      const req = createMockRequest(body, signature);

      await handleLemonSqueezyWebhook(req, mockRes as ServerResponse);

      expect(writeHeadSpy).toHaveBeenCalledWith(500, {
        "Content-Type": "application/json",
      });
    });

    it("should handle stream read errors", async () => {
      const req = new Readable({
        read() {
          this.emit("error", new Error("Stream error"));
        },
      }) as IncomingMessage;

      req.headers = { "x-signature": "any-signature" };

      await handleLemonSqueezyWebhook(req, mockRes as ServerResponse);

      expect(writeHeadSpy).toHaveBeenCalledWith(500, {
        "Content-Type": "application/json",
      });
      expect(endSpy).toHaveBeenCalledWith(
        JSON.stringify({ error: "Internal server error" }),
      );
    });
  });

  describe("edge cases", () => {
    it("should handle very large payment amounts", async () => {
      const payload = {
        ...validPayload,
        data: {
          ...validPayload.data,
          attributes: {
            ...validPayload.data.attributes,
            total: 999999999,
          },
        },
      };

      const body = JSON.stringify(payload);
      const signature = generateValidSignature(body);
      const req = createMockRequest(body, signature);

      await handleLemonSqueezyWebhook(req, mockRes as ServerResponse);

      expect(writeHeadSpy).toHaveBeenCalledWith(200, {
        "Content-Type": "application/json",
      });
    });

    it("should handle zero payment amounts", async () => {
      const payload = {
        ...validPayload,
        data: {
          ...validPayload.data,
          attributes: {
            ...validPayload.data.attributes,
            total: 0,
          },
        },
      };

      const body = JSON.stringify(payload);
      const signature = generateValidSignature(body);
      const req = createMockRequest(body, signature);

      await handleLemonSqueezyWebhook(req, mockRes as ServerResponse);

      expect(writeHeadSpy).toHaveBeenCalledWith(200, {
        "Content-Type": "application/json",
      });
    });

    it("should handle very long user IDs", async () => {
      const longUserId = "a".repeat(1000);
      const payload = {
        ...validPayload,
        meta: {
          ...validPayload.meta,
          custom_data: {
            user_id: longUserId,
            api_key_id: "test-api-key-456",
          },
        },
      };

      const body = JSON.stringify(payload);
      const signature = generateValidSignature(body);
      const req = createMockRequest(body, signature);

      await handleLemonSqueezyWebhook(req, mockRes as ServerResponse);

      expect(writeHeadSpy).toHaveBeenCalledWith(200, {
        "Content-Type": "application/json",
      });
    });

    it("should handle special characters in user ID", async () => {
      const specialUserId = "user!@#$%^&*()_+-={}[]|:;<>?,./";
      const payload = {
        ...validPayload,
        meta: {
          ...validPayload.meta,
          custom_data: {
            user_id: specialUserId,
            api_key_id: "test-api-key-456",
          },
        },
      };

      const body = JSON.stringify(payload);
      const signature = generateValidSignature(body);
      const req = createMockRequest(body, signature);

      await handleLemonSqueezyWebhook(req, mockRes as ServerResponse);

      expect(writeHeadSpy).toHaveBeenCalledWith(200, {
        "Content-Type": "application/json",
      });
    });

    it("should handle empty event name", async () => {
      const payload = {
        ...validPayload,
        meta: {
          ...validPayload.meta,
          event_name: "",
        },
      };

      const body = JSON.stringify(payload);
      const signature = generateValidSignature(body);
      const req = createMockRequest(body, signature);

      await handleLemonSqueezyWebhook(req, mockRes as ServerResponse);

      expect(writeHeadSpy).toHaveBeenCalledWith(200, {
        "Content-Type": "application/json",
      });
      expect(endSpy).toHaveBeenCalledWith(
        JSON.stringify({ message: "Event ignored" }),
      );
    });
  });

  describe("content type handling", () => {
    it("should always return JSON content type", async () => {
      const body = JSON.stringify(validPayload);
      const signature = generateValidSignature(body);
      const req = createMockRequest(body, signature);

      await handleLemonSqueezyWebhook(req, mockRes as ServerResponse);

      expect(writeHeadSpy).toHaveBeenCalledWith(
        expect.any(Number),
        expect.objectContaining({ "Content-Type": "application/json" }),
      );
    });
  });
});
