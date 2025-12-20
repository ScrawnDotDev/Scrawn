import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createHmac } from "node:crypto";

// Shared mocks - initialize functions after vi is available
const loggerMock = {
  logOperationInfo: vi.fn(),
  logOperationError: vi.fn(),
  logWarning: vi.fn(),
  logDebug: vi.fn(),
};

const getStorageAdapterMock = vi.fn();
const lemonSqueezySetupMock = vi.fn();

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

// Mock modules
vi.mock("../../../errors/logger.ts", () => ({
  logger: {
    logOperationInfo: vi.fn(),
    logOperationError: vi.fn(),
    logWarning: vi.fn(),
    logDebug: vi.fn(),
  },
}));

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

describe("handleLemonSqueezyWebhook", () => {
  let loggerModule: any;
  let storageModule: any;
  let lsModule: any;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    paymentConstructorCalls.length = 0;

    // Import mocked modules
    loggerModule = await import("../../../errors/logger.ts");
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

    const payload = JSON.stringify({
      meta: { event_name: "order_created" },
      data: { attributes: { total: 100 } },
    });

    (req as any).headers["x-signature"] = "any";
    emitBody(req as MockRequest, payload);

    await handleWebhook(req, res);

    expect((res as any).statusCode).toBe(500);
    expect((res as any).body).toContain("Webhook secret not configured");
    expect(loggerModule.logger.logOperationError).toHaveBeenCalledWith(
      "LemonSqueezyWebhook",
      "config",
      "MISSING_WEBHOOK_SECRET",
      "Webhook secret not configured",
      undefined,
      {},
    );
  });

  it("returns 401 for invalid signature", async () => {
    const handleWebhook = await importHandler();

    const req = new MockRequest() as unknown as IncomingMessage;
    const res = new TestResponse() as unknown as ServerResponse;

    const payload = JSON.stringify({
      meta: { event_name: "order_created" },
      data: { attributes: { total: 100 } },
    });

    (req as any).headers["x-signature"] = "invalid-signature";
    emitBody(req as MockRequest, payload);

    await handleWebhook(req, res);

    expect((res as any).statusCode).toBe(401);
    expect((res as any).body).toContain("Invalid signature");
    expect(loggerModule.logger.logOperationError).toHaveBeenCalledWith(
      "LemonSqueezyWebhook",
      "validate_signature",
      "INVALID_SIGNATURE",
      "Invalid webhook signature",
      undefined,
      {},
    );
  });

  it("returns 400 for invalid JSON payload", async () => {
    const secret = "test-webhook-secret";
    process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = secret;

    const handleWebhook = await importHandler();

    const req = new MockRequest() as unknown as IncomingMessage;
    const res = new TestResponse() as unknown as ServerResponse;

    const rawBody = "{"; // invalid JSON
    const signature = createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    (req as any).headers["x-signature"] = signature;
    emitBody(req as MockRequest, rawBody);

    await handleWebhook(req, res);

    expect((res as any).statusCode).toBe(400);
    expect((res as any).body).toContain("Invalid JSON payload");
    expect(loggerModule.logger.logOperationError).toHaveBeenCalledWith(
      "LemonSqueezyWebhook",
      "parse_payload",
      "INVALID_JSON",
      "Invalid JSON payload",
      expect.any(Error),
      {},
    );
  });

  it("ignores non-order_created events", async () => {
    const secret = "test-webhook-secret";
    process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = secret;

    const handleWebhook = await importHandler();

    const req = new MockRequest() as unknown as IncomingMessage;
    const res = new TestResponse() as unknown as ServerResponse;

    const payload = JSON.stringify({
      meta: { event_name: "subscription_created" },
      data: { attributes: { total: 100 } },
    });

    const signature = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    (req as any).headers["x-signature"] = signature;
    emitBody(req as MockRequest, payload);

    await handleWebhook(req, res);

    expect((res as any).statusCode).toBe(200);
    expect((res as any).body).toContain("Event ignored");
    expect(
      storageModule.StorageAdapterFactory.getStorageAdapter,
    ).not.toHaveBeenCalled();
    expect(paymentConstructorCalls.length).toBe(0);
  });

  it("returns 400 when user_id is missing", async () => {
    const secret = "test-webhook-secret";
    process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = secret;

    const handleWebhook = await importHandler();

    const req = new MockRequest() as unknown as IncomingMessage;
    const res = new TestResponse() as unknown as ServerResponse;

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

    await handleWebhook(req, res);

    expect((res as any).statusCode).toBe(400);
    expect((res as any).body).toContain("Missing user_id in webhook payload");
    expect(loggerModule.logger.logOperationError).toHaveBeenCalledWith(
      "LemonSqueezyWebhook",
      "validate_payload",
      "MISSING_USER_ID",
      "Missing user_id in webhook payload",
      undefined,
      {},
    );
  });

  it("returns 400 when apiKeyId is missing", async () => {
    const secret = "test-webhook-secret";
    process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = secret;

    const handleWebhook = await importHandler();

    const req = new MockRequest() as unknown as IncomingMessage;
    const res = new TestResponse() as unknown as ServerResponse;

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

    await handleWebhook(req, res);

    expect((res as any).statusCode).toBe(400);
    expect((res as any).body).toContain("Missing apiKeyId in webhook payload");
    expect(loggerModule.logger.logOperationError).toHaveBeenCalledWith(
      "LemonSqueezyWebhook",
      "validate_payload",
      "MISSING_API_KEY_ID",
      "Missing apiKeyId in webhook payload",
      undefined,
      { userId: "user-123" },
    );
  });

  it("stores payment and returns 200 on success", async () => {
    const secret = "test-webhook-secret";
    process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = secret;

    const adapterAddMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(
      storageModule.StorageAdapterFactory.getStorageAdapter,
    ).mockResolvedValue({
      add: adapterAddMock,
    } as any);

    const handleWebhook = await importHandler();

    const req = new MockRequest() as unknown as IncomingMessage;
    const res = new TestResponse() as unknown as ServerResponse;

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

    await handleWebhook(req, res);

    expect(paymentConstructorCalls.length).toBe(1);
    expect(paymentConstructorCalls[0]).toEqual({
      userId: "user-123",
      data: { creditAmount: 123 },
    });

    expect(
      storageModule.StorageAdapterFactory.getStorageAdapter,
    ).toHaveBeenCalledTimes(1);
    const adapterCall = vi.mocked(
      storageModule.StorageAdapterFactory.getStorageAdapter,
    ).mock.calls[0];
    expect(adapterCall[1]).toBe("api-key-456");

    expect(adapterAddMock).toHaveBeenCalledTimes(1);

    expect((res as any).statusCode).toBe(200);
    expect((res as any).body).toContain("Webhook processed successfully");
  });

  it("returns 500 when database error occurs", async () => {
    const secret = "test-webhook-secret";
    process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = secret;

    const dbError = new Error("DB error");
    const adapterAddMock = vi.fn().mockRejectedValue(dbError);
    vi.mocked(
      storageModule.StorageAdapterFactory.getStorageAdapter,
    ).mockResolvedValue({
      add: adapterAddMock,
    } as any);

    const handleWebhook = await importHandler();

    const req = new MockRequest() as unknown as IncomingMessage;
    const res = new TestResponse() as unknown as ServerResponse;

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

    await handleWebhook(req, res);

    expect((res as any).statusCode).toBe(500);
    expect((res as any).body).toContain("Database error");

    expect(loggerModule.logger.logOperationError).toHaveBeenCalledWith(
      "LemonSqueezyWebhook",
      "database",
      "DATABASE_ERROR",
      "Database error while storing payment",
      dbError,
      { userId: "user-123", apiKeyId: "api-key-456" },
    );
  });

  it("returns 500 on unexpected errors (e.g. readBody error)", async () => {
    const secret = "test-webhook-secret";
    process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = secret;

    const handleWebhook = await importHandler();

    const req = new MockRequest() as unknown as IncomingMessage;
    const res = new TestResponse() as unknown as ServerResponse;

    // Emit an error instead of data/end so readBody rejects
    setImmediate(() => {
      (req as MockRequest).emit("error", new Error("read error"));
    });

    await handleWebhook(req, res);

    expect((res as any).statusCode).toBe(500);
    expect((res as any).body).toContain("Internal server error");
    expect(loggerModule.logger.logOperationError).toHaveBeenCalledWith(
      "LemonSqueezyWebhook",
      "failed",
      "UNEXPECTED_ERROR",
      "Unexpected error in webhook handler",
      expect.any(Error),
      {},
    );
  });
});
