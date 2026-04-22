import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { WideEventBuilder } from "../../../context/requestContext";

const paymentConstructorCalls: Array<{ userId: string; data: unknown }> = [];

vi.mock("../../../factory/StorageAdapterFactory.ts", () => ({
  StorageAdapterFactory: {
    getStorageAdapter: vi.fn(),
  },
}));

vi.mock("../../../factory/eventTypeMap.ts", () => ({
  REQUEST_EVENT_BASE_MAP: {
    REQUEST_SDK_CALL: "SDK_CALL",
    REQUEST_AI_TOKEN_USAGE: "AI_TOKEN_USAGE",
    REQUEST_PAYMENT: "PAYMENT",
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

async function importHandler() {
  const module = await import("../../../routes/http/createdCheckout.ts");
  return module.handleLemonSqueezyWebhook;
}

function createMockBuilder(): WideEventBuilder {
  return new WideEventBuilder(
    "test-request-id",
    "POST",
    "/webhooks/lemonsqueezy/createdCheckout"
  );
}

function signatureFor(payload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
}

describe("handleLemonSqueezyWebhook", () => {
  let storageModule: typeof import("../../../factory/StorageAdapterFactory.ts");

  beforeEach(async () => {
    vi.clearAllMocks();
    paymentConstructorCalls.length = 0;
    storageModule = await import("../../../factory/StorageAdapterFactory.ts");
    process.env.LEMON_SQUEEZY_API_KEY = "test-api-key";
    process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = "test-webhook-secret";
  });

  it("returns 500 when webhook secret is missing", async () => {
    delete process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
    const handleWebhook = await importHandler();
    const builder = createMockBuilder();

    const result = await handleWebhook('{"meta":{},"data":{}}', "any", builder);

    expect(result.statusCode).toBe(500);
    expect(result.body.error).toContain("Webhook secret not configured");
  });

  it("returns 401 for invalid signature", async () => {
    const handleWebhook = await importHandler();
    const builder = createMockBuilder();

    const payload = JSON.stringify({
      meta: { event_name: "order_created" },
      data: { id: "order-1", attributes: { total: 100 } },
    });

    const result = await handleWebhook(payload, "invalid-signature", builder);

    expect(result.statusCode).toBe(401);
    expect(result.body.error).toContain("Invalid signature");
  });

  it("returns 400 for invalid payload shape", async () => {
    const secret = "test-webhook-secret";
    process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = secret;
    const handleWebhook = await importHandler();
    const builder = createMockBuilder();

    const payload = JSON.stringify({ invalid: true });
    const signature = signatureFor(payload, secret);

    const result = await handleWebhook(payload, signature, builder);

    expect(result.statusCode).toBe(400);
    expect(result.body.error).toContain("Invalid webhook payload shape");
  });

  it("ignores non-order_created events", async () => {
    const secret = "test-webhook-secret";
    process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = secret;
    const handleWebhook = await importHandler();
    const builder = createMockBuilder();

    const payload = JSON.stringify({
      meta: { event_name: "subscription_created" },
      data: {
        id: "order-1",
        attributes: { total: 100 },
      },
    });

    const signature = signatureFor(payload, secret);
    const result = await handleWebhook(payload, signature, builder);

    expect(result.statusCode).toBe(200);
    expect(result.body.message).toContain("Event ignored");
    expect(
      storageModule.StorageAdapterFactory.getStorageAdapter
    ).not.toHaveBeenCalled();
    expect(paymentConstructorCalls.length).toBe(0);
  });

  it("stores payment and returns 200 on success", async () => {
    const secret = "test-webhook-secret";
    process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = secret;

    const adapterAddMock = vi.fn().mockResolvedValue(undefined);
    const getStorageAdapterMock = storageModule.StorageAdapterFactory
      .getStorageAdapter as unknown as ReturnType<typeof vi.fn>;
    getStorageAdapterMock.mockResolvedValue({
      add: adapterAddMock,
    } as never);

    const handleWebhook = await importHandler();
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
        id: "order-1",
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

    const signature = signatureFor(payload, secret);
    const result = await handleWebhook(payload, signature, builder);

    expect(paymentConstructorCalls.length).toBe(1);
    expect(paymentConstructorCalls[0]).toEqual({
      userId: "user-123",
      data: { creditAmount: 123 },
    });
    expect(getStorageAdapterMock).toHaveBeenCalledTimes(1);
    expect(getStorageAdapterMock.mock.calls[0]?.[1]).toBe("api-key-456");
    expect(adapterAddMock).toHaveBeenCalledTimes(1);
    expect(result.statusCode).toBe(200);
    expect(result.body.message).toContain("Webhook processed successfully");
  });
});
