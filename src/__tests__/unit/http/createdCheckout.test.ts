import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createHmac } from "node:crypto";
import { WideEventBuilder } from "../../../context/requestContext";

// Track Payment constructor calls
const paymentConstructorCalls: Array<{ userId: string; data: unknown }> = [];

class PaymentMock {
  public userId: string;
  public data: unknown;
  public readonly type = "PAYMENT" as const;
  public reported_timestamp = { toISO: () => "2024-01-01T00:00:00.000Z" };

  constructor(userId: string, data: unknown) {
    this.userId = userId;
    this.data = data;
    paymentConstructorCalls.push({ userId, data });
  }

  serialize() {
    return {
      SQL: {
        type: this.type,
        userId: this.userId,
        reported_timestamp: this.reported_timestamp,
        data: this.data,
      },
    };
  }
}

vi.mock("../../../factory/StorageAdapterFactory.ts", () => ({
  StorageAdapterFactory: {
    getStorageAdapter: vi.fn(),
  },
}));

vi.mock("../../../events/RawEvents/Payment.ts", () => ({
  Payment: class Payment {
    public userId: string;
    public data: unknown;
    public readonly type = "PAYMENT" as const;
    public reported_timestamp = { toISO: () => "2024-01-01T00:00:00.000Z" };

    constructor(userId: string, data: unknown) {
      this.userId = userId;
      this.data = data;
      paymentConstructorCalls.push({ userId, data });
    }

    serialize() {
      return {
        SQL: {
          type: this.type,
          userId: this.userId,
          reported_timestamp: this.reported_timestamp,
          data: this.data,
        },
      };
    }
  },
}));

vi.mock("@lemonsqueezy/lemonsqueezy.js", () => ({
  lemonSqueezySetup: vi.fn(),
}));

class MockRequest extends EventEmitter {
  public headers: Record<string, string | string[] | undefined> = {};
}

class TestResponse {
  public statusCode: number | undefined;
  public headers: Record<string, string> = {};
  public body = "";

  writeHead(statusCode: number, headers: Record<string, string>): void {
    this.statusCode = statusCode;
    this.headers = headers;
  }

  end(chunk?: string): void {
    if (chunk) {
      this.body += chunk;
    }
  }
}

async function importHandler() {
  const module = await import("../../../routes/http/createdCheckout.ts");
  return module.handleLemonSqueezyWebhook;
}

function emitBody(req: MockRequest, body: string): void {
  setImmediate(() => {
    req.emit("data", Buffer.from(body));
    req.emit("end");
  });
}

/**
 * Create a mock WideEventBuilder for testing.
 */
function createMockBuilder(): WideEventBuilder {
  return new WideEventBuilder("test-request-id", "POST", "/webhooks/lemonsqueezy/createdCheckout");
}

describe("handleLemonSqueezyWebhook", () => {
  let storageModule: any;
  let lsModule: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    paymentConstructorCalls.length = 0;

    // Import mocked modules
    storageModule = await import("../../../factory/StorageAdapterFactory.ts");
    lsModule = await import("@lemonsqueezy/lemonsqueezy.js");

    // Default env; individual tests can override
    process.env.LEMON_SQUEEZY_API_KEY = "test-api-key";
    process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = "test-webhook-secret";
  });

  it("returns 500 when webhook secret is missing", async () => {
    delete process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;

    const handleWebhook = await importHandler();

    const req = new MockRequest() as unknown as IncomingMessage;
    const res = new TestResponse() as unknown as ServerResponse;
    const builder = createMockBuilder();

    const payload = JSON.stringify({
      meta: { event_name: "order_created" },
      data: { attributes: { total: 100 } },
    });

    (req as any).headers["x-signature"] = "any";
    emitBody(req as MockRequest, payload);

    await handleWebhook(req, res, builder);

    expect((res as any).statusCode).toBe(500);
    expect((res as any).body).toContain("Webhook secret not configured");
  });

  it("returns 401 for invalid signature", async () => {
    const handleWebhook = await importHandler();

    const req = new MockRequest() as unknown as IncomingMessage;
    const res = new TestResponse() as unknown as ServerResponse;
    const builder = createMockBuilder();

    const payload = JSON.stringify({
      meta: { event_name: "order_created" },
      data: { attributes: { total: 100 } },
    });

    (req as any).headers["x-signature"] = "invalid-signature";
    emitBody(req as MockRequest, payload);

    await handleWebhook(req, res, builder);

    expect((res as any).statusCode).toBe(401);
    expect((res as any).body).toContain("Invalid signature");
  });

  it("returns 400 for invalid JSON payload", async () => {
    const secret = "test-webhook-secret";
    process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = secret;

    const handleWebhook = await importHandler();

    const req = new MockRequest() as unknown as IncomingMessage;
    const res = new TestResponse() as unknown as ServerResponse;
    const builder = createMockBuilder();

    const rawBody = "{"; // invalid JSON
    const signature = createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    (req as any).headers["x-signature"] = signature;
    emitBody(req as MockRequest, rawBody);

    await handleWebhook(req, res, builder);

    expect((res as any).statusCode).toBe(400);
    expect((res as any).body).toContain("Invalid JSON payload");
  });

  it("ignores non-order_created events", async () => {
    const secret = "test-webhook-secret";
    process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = secret;

    const handleWebhook = await importHandler();

    const req = new MockRequest() as unknown as IncomingMessage;
    const res = new TestResponse() as unknown as ServerResponse;
    const builder = createMockBuilder();

    const payload = JSON.stringify({
      meta: { event_name: "subscription_created" },
      data: { attributes: { total: 100 } },
    });

    const signature = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    (req as any).headers["x-signature"] = signature;
    emitBody(req as MockRequest, payload);

    await handleWebhook(req, res, builder);

    expect((res as any).statusCode).toBe(200);
    expect((res as any).body).toContain("Event ignored");
    expect(
      storageModule.StorageAdapterFactory.getStorageAdapter
    ).not.toHaveBeenCalled();
    expect(paymentConstructorCalls.length).toBe(0);
  });

  it("returns 400 when user_id is missing", async () => {
    const secret = "test-webhook-secret";
    process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = secret;

    const handleWebhook = await importHandler();

    const req = new MockRequest() as unknown as IncomingMessage;
    const res = new TestResponse() as unknown as ServerResponse;
    const builder = createMockBuilder();

    const payload = JSON.stringify({
      meta: {
        event_name: "order_created",
        // custom_data missing user_id
        custom_data: {},
      },
      data: { attributes: { total: 100 } },
    });

    const signature = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    (req as any).headers["x-signature"] = signature;
    emitBody(req as MockRequest, payload);

    await handleWebhook(req, res, builder);

    expect((res as any).statusCode).toBe(400);
    expect((res as any).body).toContain("Missing user_id in webhook payload");
  });

  it("returns 400 when apiKeyId is missing", async () => {
    const secret = "test-webhook-secret";
    process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = secret;

    const handleWebhook = await importHandler();

    const req = new MockRequest() as unknown as IncomingMessage;
    const res = new TestResponse() as unknown as ServerResponse;
    const builder = createMockBuilder();

    const payload = JSON.stringify({
      meta: {
        event_name: "order_created",
        custom_data: {
          user_id: "user-123",
          // api_key_id missing
        },
      },
      data: { attributes: { total: 100 } },
    });

    const signature = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    (req as any).headers["x-signature"] = signature;
    emitBody(req as MockRequest, payload);

    await handleWebhook(req, res, builder);

    expect((res as any).statusCode).toBe(400);
    expect((res as any).body).toContain("Missing apiKeyId in webhook payload");
  });

  it("stores payment and returns 200 on success", async () => {
    const secret = "test-webhook-secret";
    process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = secret;

    const adapterAddMock = vi.fn().mockResolvedValue(undefined);
    const getStorageAdapterMock = storageModule.StorageAdapterFactory
      .getStorageAdapter as ReturnType<typeof vi.fn>;
    getStorageAdapterMock.mockResolvedValue({
      add: adapterAddMock,
    } as any);

    const handleWebhook = await importHandler();

    const req = new MockRequest() as unknown as IncomingMessage;
    const res = new TestResponse() as unknown as ServerResponse;
    const builder = createMockBuilder();

    const payload = JSON.stringify({
      meta: {
        event_name: "order_created",
        custom_data: {
          user_id: "user-123",
          api_key_id: "api-key-456",
        },
      },
      data: {
        attributes: {
          total: 123.4,
          total_usd: 123.4,
          store_id: 1,
          customer_id: 2,
          order_number: 3,
          status: "paid",
          created_at: "2024-01-01T00:00:00.000Z",
          updated_at: "2024-01-01T00:00:00.000Z",
        },
      },
    });

    const signature = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    (req as any).headers["x-signature"] = signature;
    emitBody(req as MockRequest, payload);

    await handleWebhook(req, res, builder);

    expect(paymentConstructorCalls.length).toBe(1);
    expect(paymentConstructorCalls[0]).toEqual({
      userId: "user-123",
      data: { creditAmount: 123 },
    });

    expect(
      storageModule.StorageAdapterFactory.getStorageAdapter
    ).toHaveBeenCalledTimes(1);
    expect(getStorageAdapterMock.mock.calls[0]?.[1]).toBe("api-key-456");

    expect(adapterAddMock).toHaveBeenCalledTimes(1);

    expect((res as any).statusCode).toBe(200);
    expect((res as any).body).toContain("Webhook processed successfully");
  });

  it("returns 500 when database error occurs", async () => {
    const secret = "test-webhook-secret";
    process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = secret;

    const dbError = new Error("DB error");
    const adapterAddMock = vi.fn().mockRejectedValue(dbError);
    const getStorageAdapterMock = storageModule.StorageAdapterFactory
      .getStorageAdapter as ReturnType<typeof vi.fn>;
    getStorageAdapterMock.mockResolvedValue({
      add: adapterAddMock,
    } as any);

    const handleWebhook = await importHandler();

    const req = new MockRequest() as unknown as IncomingMessage;
    const res = new TestResponse() as unknown as ServerResponse;
    const builder = createMockBuilder();

    const payload = JSON.stringify({
      meta: {
        event_name: "order_created",
        custom_data: {
          user_id: "user-123",
          api_key_id: "api-key-456",
        },
      },
      data: {
        attributes: {
          total: 50,
          total_usd: 50,
          store_id: 1,
          customer_id: 2,
          order_number: 3,
          status: "paid",
          created_at: "2024-01-01T00:00:00.000Z",
          updated_at: "2024-01-01T00:00:00.000Z",
        },
      },
    });

    const signature = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    (req as any).headers["x-signature"] = signature;
    emitBody(req as MockRequest, payload);

    await handleWebhook(req, res, builder);

    expect((res as any).statusCode).toBe(500);
    expect((res as any).body).toContain("Database error");

  });

  it("returns 500 on unexpected errors (e.g. readBody error)", async () => {
    const secret = "test-webhook-secret";
    process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = secret;

    const handleWebhook = await importHandler();

    const req = new MockRequest() as unknown as IncomingMessage;
    const res = new TestResponse() as unknown as ServerResponse;
    const builder = createMockBuilder();

    // Emit an error instead of data/end so readBody rejects
    setImmediate(() => {
      (req as MockRequest).emit("error", new Error("read error"));
    });

    await handleWebhook(req, res, builder);

    expect((res as any).statusCode).toBe(500);
    expect((res as any).body).toContain("Internal server error");
  });
});
