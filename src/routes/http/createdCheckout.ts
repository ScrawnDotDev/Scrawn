import type { IncomingMessage, ServerResponse } from "node:http";
import crypto from "node:crypto";
import { lemonSqueezySetup } from "@lemonsqueezy/lemonsqueezy.js";
import { Payment } from "../../events/RawEvents/Payment.ts";
import { PostgresAdapter } from "../../storage/adapter/postgres/postgres.ts";
import { StorageAdapterFactory } from "../../factory/StorageAdapterFactory.ts";
import { logger } from "../../errors/logger.ts";

const OPERATION = "LemonSqueezyWebhook";

// Initialize Lemon Squeezy SDK if API key is available
const LEMON_SQUEEZY_API_KEY = process.env.LEMON_SQUEEZY_API_KEY;

if (!LEMON_SQUEEZY_API_KEY) {
  logger.logWarning("LEMON_SQUEEZY_API_KEY not set - SDK not configured", {});
} else {
  lemonSqueezySetup({
    apiKey: LEMON_SQUEEZY_API_KEY,
    onError: (error) => {
      logger.logOperationError(
        OPERATION,
        "lemon_squeezy_sdk",
        "LEMON_SQUEEZY_SDK_ERROR",
        "Lemon Squeezy SDK error in webhook handler",
        error as Error,
        {},
      );
    },
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
  secret: string,
): boolean {
  if (!signature) {
    return false;
  }

  try {
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(payload);
    const digest = hmac.digest("hex");

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch (error) {
    logger.logOperationError(
      OPERATION,
      "signature_verification",
      "SIGNATURE_VERIFICATION_ERROR",
      "Signature verification error",
      error as Error,
      {},
    );
    return false;
  }
}

/**
 * Reads the request body as a string
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      resolve(body);
    });
    req.on("error", (error) => {
      reject(error);
    });
  });
}

/**
 * Handles the Lemon Squeezy order-created webhook
 */
export async function handleLemonSqueezyWebhook(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    logger.logOperationInfo(OPERATION, "start", "Processing webhook request", {});

    // Read the raw body
    const rawBody = await readBody(req);

    // Verify webhook signature
    const signature = req.headers["x-signature"] as string | undefined;

    // Read webhook secret at runtime for testability
    const LEMON_SQUEEZY_WEBHOOK_SECRET =
      process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;

    if (!LEMON_SQUEEZY_WEBHOOK_SECRET) {
      logger.logOperationError(
        OPERATION,
        "config",
        "MISSING_WEBHOOK_SECRET",
        "Webhook secret not configured",
        undefined,
        {},
      );
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Webhook secret not configured" }));
      return;
    }

    const isValid = verifyWebhookSignature(
      rawBody,
      signature,
      LEMON_SQUEEZY_WEBHOOK_SECRET,
    );

    if (!isValid) {
      logger.logOperationError(
        OPERATION,
        "validate_signature",
        "INVALID_SIGNATURE",
        "Invalid webhook signature",
        undefined,
        {},
      );
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid signature" }));
      return;
    }

    logger.logOperationInfo(
      OPERATION,
      "signature_validated",
      "Signature validated successfully",
      {},
    );

    // Parse the payload
    let payload: LemonSqueezyWebhookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch (error) {
      logger.logOperationError(
        OPERATION,
        "parse_payload",
        "INVALID_JSON",
        "Invalid JSON payload",
        error as Error,
        {},
      );
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON payload" }));
      return;
    }

    // Handle only order-created events
    if (payload.meta.event_name !== "order_created") {
      logger.logOperationInfo(
        OPERATION,
        "ignored_event",
        "Ignoring non-order_created event",
        { eventName: payload.meta.event_name },
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Event ignored" }));
      return;
    }

    logger.logOperationInfo(
      OPERATION,
      "processing",
      "Processing order_created event",
      {},
    );

    // Extract user ID from custom data
    const userId = payload.meta.custom_data?.user_id;
    const apiKeyId = payload.meta.custom_data?.api_key_id;

    if (!userId) {
      logger.logOperationError(
        OPERATION,
        "validate_payload",
        "MISSING_USER_ID",
        "Missing user_id in webhook payload",
        undefined,
        {},
      );
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing user_id in webhook payload" }));
      return;
    }

    if (!apiKeyId) {
      logger.logOperationError(
        OPERATION,
        "validate_payload",
        "MISSING_API_KEY_ID",
        "Missing apiKeyId in webhook payload",
        undefined,
        { userId },
      );
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing apiKeyId in webhook payload" }));
      return;
    }

    // Extract payment amount (convert from cents to the integer format used in DB)
    const creditAmount = Math.round(payload.data.attributes.total);

    logger.logOperationInfo(
      OPERATION,
      "payment_data",
      "Processing payment",
      { userId, apiKeyId, creditAmount },
    );

    // Create and store the payment event
    try {
      const paymentEvent = new Payment(userId, { creditAmount });
      const adapter = await StorageAdapterFactory.getStorageAdapter(
        paymentEvent,
        apiKeyId,
      );

      await adapter.add();

      logger.logOperationInfo(
        OPERATION,
        "completed",
        "Payment event stored successfully",
        { userId, apiKeyId, creditAmount },
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Webhook processed successfully" }));
    } catch (dbError) {
      logger.logOperationError(
        OPERATION,
        "database",
        "DATABASE_ERROR",
        "Database error while storing payment",
        dbError as Error,
        { userId, apiKeyId },
      );
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Database error" }));
    }
  } catch (error) {
    logger.logOperationError(
      OPERATION,
      "failed",
      "UNEXPECTED_ERROR",
      "Unexpected error in webhook handler",
      error as Error,
      {},
    );
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}
