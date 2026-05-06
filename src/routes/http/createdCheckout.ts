import DodoPayments from "dodopayments";
import { Payment } from "../../events/RawEvents/Payment.ts";
import { StorageAdapterFactory } from "../../factory/EventStorageAdapterFactory.ts";
import type { WideEventBuilder } from "../../context/requestContext.ts";
import { getDodoClient } from "../gRPC/payment/paymentProvider.ts";
import { getPostgresDB } from "../../storage/db/postgres/db";
import { usersTable, sessionsTable } from "../../storage/db/postgres/schema";
import { eq } from "drizzle-orm";

const isDev = process.env.NODE_ENV !== "production";

interface DodoWebhookPayload {
  type: string;
  business_id: string;
  timestamp: string;
  data: {
    payload_type: string;
    payment_id: string;
    checkout_session_id?: string;
    total_amount: number;
    currency: string;
    status: string;
    customer_id?: string;
    customer?: {
      customer_id: string;
      email?: string;
      name?: string;
    };
  };
}

interface WebhookResponse {
  statusCode: number;
  body: { message?: string; error?: string };
}

export async function handleDodoWebhook(
  rawBody: string,
  signature: string | undefined,
  timestamp: string | undefined,
  webhookId: string | undefined,
  builder: WideEventBuilder
): Promise<WebhookResponse> {
  try {
    const payloadResult = verifyWebhookPayload(
      rawBody,
      signature,
      timestamp,
      webhookId,
      builder
    );
    if (payloadResult.error) {
      return payloadResult.error;
    }

    const webhookPayload = payloadResult.payload!;

    builder.setWebhookContext({
      webhookEvent: webhookPayload.type,
      orderId: webhookPayload.data.payment_id,
    });

    if (webhookPayload.type !== "payment.succeeded") {
      builder.setSuccess(200);
      builder.addContext({ ignored: true });
      return { statusCode: 200, body: { message: "Event ignored" } };
    }

    const checkoutSessionId = webhookPayload.data.checkout_session_id;
    if (!checkoutSessionId) {
      builder.setError(400, {
        type: "ValidationError",
        message: "Missing checkout_session_id in webhook payload",
      });
      return {
        statusCode: 400,
        body: { error: "Missing checkout_session_id in webhook payload" },
      };
    }

    const sessionResult = await lookupSession(checkoutSessionId);
    if ("error" in sessionResult) {
      return sessionResult.error;}

    if (sessionResult.processed) {
      builder.setSuccess(200);
      builder.addContext({ ignored: true });
      return {
        statusCode: 200,
        body: { message: "Session already processed" },
      };
    }

    const { userId, billedUpto } = sessionResult;
    await updateUserBilling(userId, billedUpto);
    await markSessionProcessed(checkoutSessionId);

    builder.setUser(userId);
    builder.setPaymentContext({
      creditAmount: Math.round(webhookPayload.data.total_amount),
    });

    return await storePaymentEvent(userId, Math.round(webhookPayload.data.total_amount), builder);
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

function verifyWebhookPayload(
  rawBody: string,
  signature: string | undefined,
  timestamp: string | undefined,
  webhookId: string | undefined,
  builder: WideEventBuilder
): { error?: WebhookResponse; payload?: DodoWebhookPayload } {
  const client = getDodoClient();

  const headers: Record<string, string> = {
    "webhook-id": webhookId || "",
    "webhook-signature": signature || "",
    "webhook-timestamp": timestamp || "",
  };

  try {
    const webhookPayload = client.webhooks.unwrap(rawBody, {
      headers,
    }) as unknown as DodoWebhookPayload;

    if (!webhookPayload.type || !webhookPayload.data) {
      builder.setError(400, {
        type: "ParseError",
        message: "Invalid webhook payload shape",
      });
      return {
        error: {
          statusCode: 400,
          body: { error: "Invalid webhook payload shape" },
        },
      };
    }

    return { payload: webhookPayload };
  } catch {
    builder.setError(401, {
      type: "AuthenticationError",
      message: "Invalid webhook signature",
    });
    return {
      error: { statusCode: 401, body: { error: "Invalid signature" } },
    };
  }
}

async function lookupSession(
  checkoutSessionId: string
): Promise<
  { error: WebhookResponse } | { processed: boolean; userId: string; billedUpto: string }
> {
  const db = getPostgresDB();

  const sessions = await db
    .select({
      id: sessionsTable.id,
      userId: sessionsTable.userId,
      billed_upto: sessionsTable.billed_upto,
      processed: sessionsTable.processed,
    })
    .from(sessionsTable)
    .where(eq(sessionsTable.sessionId, checkoutSessionId))
    .limit(1);

  if (sessions.length === 0 || !sessions[0]) {
    return {
      error: {
        statusCode: 404,
        body: { error: "Session not found" },
      },
    };
  }

  const session = sessions[0];
  const userId = session.userId;
  const billedUpto = session.billed_upto;

  if (!userId) {
    return {
      error: {
        statusCode: 500,
        body: { error: "User ID not found for session" },
      },
    };
  }

  if (!billedUpto) {
    return {
      error: {
        statusCode: 500,
        body: { error: "billed_upto not found for session" },
      },
    };
  }

  return { processed: session.processed ?? false, userId, billedUpto };
}

async function updateUserBilling(userId: string, billedUpto: string): Promise<void> {
  const db = getPostgresDB();
  await db
    .update(usersTable)
    .set({ last_billed_timestamp: billedUpto })
    .where(eq(usersTable.id, userId));
}

async function markSessionProcessed(checkoutSessionId: string): Promise<void> {
  const db = getPostgresDB();
  await db
    .update(sessionsTable)
    .set({ processed: true })
    .where(eq(sessionsTable.sessionId, checkoutSessionId));
}

async function storePaymentEvent(
  userId: string,
  creditAmount: number,
  builder: WideEventBuilder
): Promise<WebhookResponse> {
  try {
    const paymentEvent = new Payment(userId, { creditAmount });
    const adapter = await StorageAdapterFactory.getEventStorageAdapter("PAYMENT");

    await adapter.add(paymentEvent.serialize());

    builder.setSuccess(200);
    return {
      statusCode: 200,
      body: { message: "Webhook processed successfully" },
    };
  } catch (dbError) {
    const errorMessage = dbError instanceof Error ? dbError.message : String(dbError);
    builder.setError(500, {
      type: "DatabaseError",
      message: `Failed to store payment event: ${errorMessage}`,
      cause: dbError instanceof Error ? dbError.message : undefined,
      stack: isDev && dbError instanceof Error ? dbError.stack : undefined,
    });
    return { statusCode: 500, body: { error: "Database error" } };
  }
}
