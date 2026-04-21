import crypto from "node:crypto";
import { lemonSqueezySetup } from "@lemonsqueezy/lemonsqueezy.js";
import { Payment } from "../../events/RawEvents/Payment.ts";
import { StorageAdapterFactory } from "../../factory/StorageAdapterFactory.ts";
import type { WideEventBuilder } from "../../context/requestContext.ts";

const isDev = process.env.NODE_ENV !== "production";

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

interface WebhookResponse {
  statusCode: number;
  body: { message?: string; error?: string };
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
 * Handles the Lemon Squeezy order-created webhook.
 * This handler is designed to work with the HTTP logging middleware,
 * which provides a WideEventBuilder for adding business context.
 */
export async function handleLemonSqueezyWebhook(
  rawBody: string,
  signature: string | undefined,
  builder: WideEventBuilder
): Promise<WebhookResponse> {
  try {
    // Read webhook secret at runtime for testability
    const LEMON_SQUEEZY_WEBHOOK_SECRET =
      process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;

    if (!LEMON_SQUEEZY_WEBHOOK_SECRET) {
      builder.setError(500, {
        type: "ConfigurationError",
        message: "Webhook secret not configured",
      });
      return {
        statusCode: 500,
        body: { error: "Webhook secret not configured" },
      };
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
      return { statusCode: 401, body: { error: "Invalid signature" } };
    }

    
    let webhookPayload: LemonSqueezyWebhookPayload;
    try {
      webhookPayload = JSON.parse(rawBody) as LemonSqueezyWebhookPayload;
    } catch {
      builder.setError(400, {
        type: "ParseError",
        message: "Invalid JSON payload",
      });
      return { statusCode: 400, body: { error: "Invalid JSON payload" } };
    }

    if (!webhookPayload.meta || !webhookPayload.data?.attributes) {
      builder.setError(400, {
        type: "ParseError",
        message: "Invalid webhook payload shape",
      });
      return {
        statusCode: 400,
        body: { error: "Invalid webhook payload shape" },
      };
    }

    // Add webhook event context
    builder.setWebhookContext({
      webhookEvent: webhookPayload.meta.event_name,
      orderId: webhookPayload.data.id,
    });

    // Handle only order-created events
    if (webhookPayload.meta.event_name !== "order_created") {
      builder.setSuccess(200);
      builder.addContext({ ignored: true });
      return { statusCode: 200, body: { message: "Event ignored" } };
    }

    // Extract user ID from custom data
    const userId = webhookPayload.meta.custom_data?.user_id;
    const apiKeyId = webhookPayload.meta.custom_data?.api_key_id;

    if (!userId) {
      builder.setError(400, {
        type: "ValidationError",
        message: "Missing user_id in webhook payload",
      });
      return {
        statusCode: 400,
        body: { error: "Missing user_id in webhook payload" },
      };
    }

    if (!apiKeyId) {
      builder.setError(400, {
        type: "ValidationError",
        message: "Missing apiKeyId in webhook payload",
      });
      return {
        statusCode: 400,
        body: { error: "Missing apiKeyId in webhook payload" },
      };
    }

    // Add user and payment context to wide event
    builder.setUser(userId);

    // Extract payment amount (convert from cents to the integer format used in DB)
    const creditAmount = Math.round(webhookPayload.data.attributes.total);
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
      return {
        statusCode: 200,
        body: { message: "Webhook processed successfully" },
      };
    } catch (dbError) {
      const errorMessage =
        dbError instanceof Error ? dbError.message : String(dbError);
      builder.setError(500, {
        type: "DatabaseError",
        message: `Failed to store payment event: ${errorMessage}`,
        cause: dbError instanceof Error ? dbError.message : undefined,
        stack: isDev && dbError instanceof Error ? dbError.stack : undefined,
      });
      return { statusCode: 500, body: { error: "Database error" } };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    builder.setError(500, {
      type: "InternalError",
      message: `Unexpected webhook error: ${errorMessage}`,
      cause: error instanceof Error ? error.message : undefined,
      stack: isDev && error instanceof Error ? error.stack : undefined,
    });
    return { statusCode: 500, body: { error: "Internal server error" } };
  }
}
