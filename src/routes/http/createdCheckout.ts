import type { IncomingMessage, ServerResponse } from "node:http";
import crypto from "node:crypto";
import { lemonSqueezySetup } from "@lemonsqueezy/lemonsqueezy.js";
import { getPostgresDB } from "../../storage/db/postgres/db.ts";
import {
  usersTable,
  eventsTable,
  paymentEventsTable,
} from "../../storage/db/postgres/schema.ts";
import { DateTime } from "luxon";
import { eq } from "drizzle-orm";

const LEMON_SQUEEZY_WEBHOOK_SECRET = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
const LEMON_SQUEEZY_API_KEY = process.env.LEMON_SQUEEZY_API_KEY;

if (!LEMON_SQUEEZY_WEBHOOK_SECRET) {
  console.warn(
    "LEMON_SQUEEZY_WEBHOOK_SECRET is not set - webhook signature verification will fail",
  );
}

if (!LEMON_SQUEEZY_API_KEY) {
  console.warn(
    "LEMON_SQUEEZY_API_KEY is not set - Lemon Squeezy SDK not configured",
  );
} else {
  lemonSqueezySetup({
    apiKey: LEMON_SQUEEZY_API_KEY,
    onError: (error) => {
      console.error("[LemonSqueezy SDK Error in webhook handler]", error);
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
    console.error("[Webhook] No signature provided");
    return false;
  }

  try {
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(payload);
    const digest = hmac.digest("hex");

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch (error) {
    console.error("[Webhook] Signature verification error:", error);
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
    // Read the raw body
    const rawBody = await readBody(req);

    // Verify webhook signature
    const signature = req.headers["x-signature"] as string | undefined;

    if (!LEMON_SQUEEZY_WEBHOOK_SECRET) {
      console.error("[Webhook] Webhook secret not configured");
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
      console.error("[Webhook] Invalid signature");
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid signature" }));
      return;
    }

    // Parse the payload
    let payload: LemonSqueezyWebhookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch (error) {
      console.error("[Webhook] Invalid JSON payload:", error);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON payload" }));
      return;
    }

    // Handle only order-created events
    if (payload.meta.event_name !== "order_created") {
      console.log(`[Webhook] Ignoring event: ${payload.meta.event_name}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Event ignored" }));
      return;
    }

    console.log("[Webhook] Processing order_created event");

    // Extract user ID from custom data
    const userId = payload.meta.custom_data?.user_id;
    const apiKeyId = payload.meta.custom_data?.api_key_id;

    console.log(JSON.stringify(payload.meta));

    if (!userId) {
      console.error("[Webhook] No user_id in custom_data");
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing user_id in webhook payload" }));
      return;
    }

    if (!apiKeyId) {
      console.error("[Webhook] No apiKeyId in custom_data");
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing apiKeyId in webhook payload" }));
      return;
    }

    // Extract payment amount (convert from cents to the integer format used in DB)
    const creditAmount = Math.round(payload.data.attributes.total);

    console.log(
      `[Webhook] Processing payment for user ${userId}, amount: ${creditAmount}`,
    );

    // Store the payment event in the database
    const db = getPostgresDB();

    try {
      await db.transaction(async (tx) => {
        // Ensure user exists
        const existingUsers = await tx
          .select()
          .from(usersTable)
          .where((usersTable) => eq(usersTable.id, userId))
          .limit(1);

        if (existingUsers.length === 0) {
          console.log(`[Webhook] Creating new user: ${userId}`);
          await tx.insert(usersTable).values({
            id: userId,
          });
        }

        // Create event record (without api_key since this is a webhook)
        const [eventRecord] = await tx
          .insert(eventsTable)
          .values({
            reported_timestamp: DateTime.utc().toISO(),
            userId: userId,
            api_keyId: apiKeyId, // Webhook events don't have an API key
          })
          .returning({ id: eventsTable.id });

        if (!eventRecord) {
          throw new Error("Failed to create event record");
        }

        // Create payment event record
        await tx.insert(paymentEventsTable).values({
          id: eventRecord.id,
          creditAmount: creditAmount,
        });

        console.log(
          `[Webhook] Payment event stored successfully for user ${userId}`,
        );
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Webhook processed successfully" }));
    } catch (dbError) {
      console.error("[Webhook] Database error:", dbError);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Database error" }));
    }
  } catch (error) {
    console.error("[Webhook] Unexpected error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}
