import crypto from "node:crypto";
import { Payment } from "../../events/RawEvents/Payment.ts";
import { StorageAdapterFactory } from "../../factory/EventStorageAdapterFactory.ts";
import type { WideEventBuilder } from "../../context/requestContext.ts";

const isDev = process.env.NODE_ENV !== "production";

interface DodoWebhookPayload {
  type: string;
  business_id: string;
  timestamp: string;
  data: {
    payload_type: string;
    payment_id: string;
    customer_id: string;
    customer_email?: string;
    customer_name?: string;
    total_amount: number;
    currency: string;
    metadata?: {
      user_id?: string;
      api_key_id?: string;
      custom_price?: string;
    };
    product_id?: string;
    subscription_id?: string;
  };
}

interface WebhookResponse {
  statusCode: number;
  body: { message?: string; error?: string };
}

function verifyWebhookSignature(
  payload: string,
  signature: string | undefined,
  timestamp: string | undefined,
  secret: string
): boolean {
  if (!signature || !timestamp) {
    return false;
  }

  try {
    const signedPayload = `${timestamp}.${payload}`;
    const parts = signature.split(",");
    if (parts.length !== 2 || !parts[1]) {
      return false;
    }

    const providedSig = parts[1];
    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(signedPayload)
      .digest("base64");

    const expectedSigBuffer = Buffer.from(expectedSig);
    const providedSigBuffer = Buffer.from(providedSig);

    return crypto.timingSafeEqual(expectedSigBuffer, providedSigBuffer);
  } catch {
    return false;
  }
}

export async function handleDodoWebhook(
  rawBody: string,
  signature: string | undefined,
  timestamp: string | undefined,
  builder: WideEventBuilder
): Promise<WebhookResponse> {
  try {
    const WEBHOOK_SECRET = process.env.DODO_PAYMENTS_WEBHOOK_SECRET;

    if (!WEBHOOK_SECRET) {
      builder.setError(500, {
        type: "ConfigurationError",
        message: "Dodo webhook secret not configured",
      });
      return {
        statusCode: 500,
        body: { error: "Webhook secret not configured" },
      };
    }

    const isValid = verifyWebhookSignature(
      rawBody,
      signature,
      timestamp,
      WEBHOOK_SECRET
    );

    if (!isValid) {
      builder.setError(401, {
        type: "AuthenticationError",
        message: "Invalid webhook signature",
      });
      return { statusCode: 401, body: { error: "Invalid signature" } };
    }

    let webhookPayload: DodoWebhookPayload;
    try {
      webhookPayload = JSON.parse(rawBody) as DodoWebhookPayload;
    } catch {
      builder.setError(400, {
        type: "ParseError",
        message: "Invalid JSON payload",
      });
      return { statusCode: 400, body: { error: "Invalid JSON payload" } };
    }

    if (!webhookPayload.type || !webhookPayload.data) {
      builder.setError(400, {
        type: "ParseError",
        message: "Invalid webhook payload shape",
      });
      return {
        statusCode: 400,
        body: { error: "Invalid webhook payload shape" },
      };
    }

    builder.setWebhookContext({
      webhookEvent: webhookPayload.type,
      orderId: webhookPayload.data.payment_id,
    });

    if (webhookPayload.type !== "payment.succeeded") {
      builder.setSuccess(200);
      builder.addContext({ ignored: true });
      return { statusCode: 200, body: { message: "Event ignored" } };
    }

    const { metadata, total_amount } = webhookPayload.data;

    if (!metadata?.user_id) {
      builder.setError(400, {
        type: "ValidationError",
        message: "Missing user_id in webhook metadata",
      });
      return {
        statusCode: 400,
        body: { error: "Missing user_id in webhook metadata" },
      };
    }

    builder.setUser(metadata.user_id);

    const creditAmount = Math.round(total_amount);
    builder.setPaymentContext({ creditAmount });

    try {
      const paymentEvent = new Payment(metadata.user_id, { creditAmount });
      const adapter =
        await StorageAdapterFactory.getEventStorageAdapter("PAYMENT");

      await adapter.add(paymentEvent.serialize(), "");

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
