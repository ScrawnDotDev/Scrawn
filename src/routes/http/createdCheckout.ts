import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { lemonSqueezySetup } from "@lemonsqueezy/lemonsqueezy.js";
import { Payment } from "../../events/RawEvents/Payment.ts";
import { StorageAdapterFactory } from "../../factory/StorageAdapterFactory.ts";
import type { WideEventBuilder } from "../../context/requestContext.ts";

// Initialize Lemon Squeezy SDK if API key is available
const LEMON_SQUEEZY_API_KEY = process.env.LEMON_SQUEEZY_API_KEY;

if (LEMON_SQUEEZY_API_KEY) {
  lemonSqueezySetup({
    apiKey: LEMON_SQUEEZY_API_KEY,
  });
}

interface LemonSqueezyWebhookPayload {
  meta: {
    event_name: string;
    custom_data?: {
      user_id?: string;
      api_key_id?: string;
    };
  };
  data: {
    id: string;
    type: string;
    attributes: {
      store_id: number;
      customer_id: number;
      order_number: number;
      total: number;
      total_usd: number;
      status: string;
      created_at: string;
      updated_at: string;
    };
  };
}

/**
 * Verifies the webhook signature from Lemon Squeezy
 */
function verifyWebhookSignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) {
    return false;
  }

  try {
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(payload);
    const digest = hmac.digest("hex");

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch {
    return false;
  }
}

/**
 * Reads the request body as a string
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      resolve(body);
    });
    req.on("error", (error: Error) => {
      reject(error);
    });
  });
}

/**
 * Handles the Lemon Squeezy order-created webhook.
 * This handler is designed to work with the HTTP logging middleware,
 * which provides a WideEventBuilder for adding business context.
 */
export async function handleLemonSqueezyWebhook(
  req: IncomingMessage,
  res: ServerResponse,
  builder: WideEventBuilder
): Promise<void> {
  try {
    // Read the raw body
    const rawBody = await readBody(req);

    // Verify webhook signature
    const signature = req.headers["x-signature"] as string | undefined;

    // Read webhook secret at runtime for testability
    const LEMON_SQUEEZY_WEBHOOK_SECRET =
      process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;

    if (!LEMON_SQUEEZY_WEBHOOK_SECRET) {
      builder.setError(500, {
        type: "ConfigurationError",
        message: "Webhook secret not configured",
      });
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Webhook secret not configured" }));
      return;
    }

    const isValid = verifyWebhookSignature(
      rawBody,
      signature,
      LEMON_SQUEEZY_WEBHOOK_SECRET
    );

    if (!isValid) {
      builder.setError(401, {
        type: "AuthenticationError",
        message: "Invalid signature",
      });
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid signature" }));
      return;
    }

    // Parse the payload
    let payload: LemonSqueezyWebhookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      builder.setError(400, {
        type: "ParseError",
        message: "Invalid JSON payload",
      });
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON payload" }));
      return;
    }

    // Add webhook event context
    builder.setWebhookContext({
      webhookEvent: payload.meta.event_name,
      orderId: payload.data.id,
    });

    // Handle only order-created events
    if (payload.meta.event_name !== "order_created") {
      builder.setSuccess(200);
      builder.addContext({ ignored: true });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Event ignored" }));
      return;
    }

    // Extract user ID from custom data
    const userId = payload.meta.custom_data?.user_id;
    const apiKeyId = payload.meta.custom_data?.api_key_id;

    if (!userId) {
      builder.setError(400, {
        type: "ValidationError",
        message: "Missing user_id in webhook payload",
      });
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing user_id in webhook payload" }));
      return;
    }

    if (!apiKeyId) {
      builder.setError(400, {
        type: "ValidationError",
        message: "Missing apiKeyId in webhook payload",
      });
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing apiKeyId in webhook payload" }));
      return;
    }

    // Add user and payment context to wide event
    builder.setUser(userId);

    // Extract payment amount (convert from cents to the integer format used in DB)
    const creditAmount = Math.round(payload.data.attributes.total);
    builder.setPaymentContext({ creditAmount });

    // Create and store the payment event
    try {
      const paymentEvent = new Payment(userId, { creditAmount });
      const adapter = await StorageAdapterFactory.getStorageAdapter(
        paymentEvent,
        apiKeyId
      );

      await adapter.add(paymentEvent.serialize());

      builder.setSuccess(200);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Webhook processed successfully" }));
    } catch (dbError) {
      builder.setError(500, {
        type: "DatabaseError",
        message: "Database error",
        cause: dbError instanceof Error ? dbError.message : undefined,
      });
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Database error" }));
    }
  } catch (error) {
    builder.setError(500, {
      type: "InternalError",
      message: "Internal server error",
      cause: error instanceof Error ? error.message : undefined,
    });
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}
