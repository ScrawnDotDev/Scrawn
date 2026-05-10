import DodoPayments from "dodopayments";
import * as Sentry from "@sentry/bun";
import { Payment } from "../../events/Payment.ts";
import { StorageAdapterFactory } from "../../factory/EventStorageAdapterFactory.ts";
import type { WideEventBuilder } from "../../context/requestContext.ts";
import { getDodoClient } from "../gRPC/payment/paymentProvider.ts";
import { getPostgresDB } from "../../storage/db/postgres/db";
import { usersTable, sessionsTable } from "../../storage/db/postgres/schema";
import { eq } from "drizzle-orm";


const isDev = process.env.NODE_ENV !== "production";

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
    const client = getDodoClient();

    const headers: Record<string, string> = {
      "webhook-id": webhookId || "",
      "webhook-signature": signature || "",
      "webhook-timestamp": timestamp || "",
    };

    let webhookPayload: DodoPayments.Webhooks.UnwrapWebhookEvent;
    try {
      webhookPayload = client.webhooks.unwrap(rawBody, {
        headers,
      });
    } catch (error) {
      Sentry.captureException(error, {
        extra: { context: "webhook signature verification" },
      });
      builder.setError(401, {
        type: "AuthenticationError",
        message: "Invalid webhook signature",
      });
      return { statusCode: 401, body: { error: "Invalid signature" } };
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

    if (webhookPayload.type !== "payment.succeeded") {
      builder.setSuccess(200);
      builder.addContext({ ignored: true });
      return { statusCode: 200, body: { message: "Event ignored" } };
    }

    builder.setWebhookContext({
      webhookEvent: webhookPayload.type,
      orderId: webhookPayload.data.payment_id,
    });

    const { payment_id, checkout_session_id, total_amount, status } =
      webhookPayload.data;
    const creditAmount = Math.round(total_amount);

    if (!checkout_session_id) {
      builder.setError(400, {
        type: "ValidationError",
        message: "Missing checkout_session_id in webhook payload",
      });
      return {
        statusCode: 400,
        body: { error: "Missing checkout_session_id in webhook payload" },
      };
    }

    const db = getPostgresDB();

    const sessions = await db
      .select({
        id: sessionsTable.id,
        userId: sessionsTable.userId,
        billed_upto: sessionsTable.billed_upto,
        processed: sessionsTable.processed,
      })
      .from(sessionsTable)
      .where(eq(sessionsTable.sessionId, checkout_session_id))
      .limit(1);

    if (sessions.length === 0 || !sessions[0]) {
      builder.setError(404, {
        type: "NotFoundError",
        message: `Session not found for checkout_session_id: ${checkout_session_id}`,
      });
      return {
        statusCode: 404,
        body: { error: "Session not found" },
      };
    }

    const session = sessions[0];

    if (session.processed) {
      builder.setSuccess(200);
      builder.addContext({ ignored: true });
      return {
        statusCode: 200,
        body: { message: "Session already processed" },
      };
    }

    const userId = session.userId;
    const billedUpto = session.billed_upto;

    if (!userId) {
      builder.setError(500, {
        type: "InternalServerError",
        message: `User ID not found for session: ${checkout_session_id}`,
      });
      return {
        statusCode: 500,
        body: { error: "User ID not found for session" },
      };
    }

    if (!billedUpto) {
      builder.setError(500, {
        type: "InternalServerError",
        message: `billed_upto not found for session: ${checkout_session_id}`,
      });
      return {
        statusCode: 500,
        body: { error: "billed_upto not found for session" },
      };
    }

    await db
      .update(usersTable)
      .set({ last_billed_timestamp: billedUpto })
      .where(eq(usersTable.id, userId));

    await db
      .update(sessionsTable)
      .set({ processed: true })
      .where(eq(sessionsTable.sessionId, checkout_session_id));

    builder.setUser(userId);
    builder.setPaymentContext({ creditAmount });

    try {
      const paymentEvent = new Payment(userId, { creditAmount });
      const adapter =
        await StorageAdapterFactory.getEventStorageAdapter("PAYMENT");

      await adapter.add(paymentEvent.serialize());

      builder.setSuccess(200);
      return {
        statusCode: 200,
        body: { message: "Webhook processed successfully" },
      };
    } catch (dbError) {
      Sentry.captureException(dbError, {
        extra: {
          context: "payment event storage",
          checkoutSessionId: checkout_session_id,
          paymentId: payment_id,
        },
      });
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
    Sentry.captureException(error, {
      extra: { context: "unexpected webhook error" },
    });
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
