import DodoPayments from "dodopayments";
import * as Sentry from "@sentry/bun";
import type { WideEventBuilder } from "../../context/requestContext.ts";
import { handleAddPayment } from "../../storage/db/postgres/helpers/payments";
import { getDodoClient } from "../gRPC/payment/paymentProvider.ts";
import {
  getSessionByCheckoutId,
  markSessionProcessed,
} from "../../storage/db/postgres/helpers/sessions";
import { updateUserBilledTimestamp } from "../../storage/db/postgres/helpers/users";
import { getPostgresDB } from "../../storage/db/postgres/db";
import { executeInTransaction } from "../../storage/adapter/postgres/handlers/addEventUtils";
import { checkoutSessionsTable } from "../../storage/db/postgres/schema";
import { eq, and } from "drizzle-orm";

const isDev = process.env.NODE_ENV !== "production";

interface WebhookResponse {
  statusCode: number;
  body: { message?: string; error?: string };
}

function errorResponse(
  statusCode: number,
  type: string,
  message: string,
  builder: WideEventBuilder
): WebhookResponse {
  builder.setError(statusCode, { type, message });
  return { statusCode, body: { error: message } };
}

function okResponse(message: string): WebhookResponse {
  return { statusCode: 200, body: { message } };
}

function ignoredResponse(builder: WideEventBuilder): WebhookResponse {
  builder.setSuccess(200);
  builder.addContext({ ignored: true });
  return okResponse("Event ignored");
}

function buildWebhookHeaders(
  signature: string | undefined,
  timestamp: string | undefined,
  webhookId: string | undefined
): Record<string, string> {
  return {
    "webhook-id": webhookId || "",
    "webhook-signature": signature || "",
    "webhook-timestamp": timestamp || "",
  };
}

function unwrapWebhookPayload(
  client: DodoPayments,
  rawBody: string,
  headers: Record<string, string>
): DodoPayments.Webhooks.UnwrapWebhookEvent | null {
  try {
    return client.webhooks.unwrap(rawBody, { headers });
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "webhook signature verification" },
    });
    return null;
  }
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
    const headers = buildWebhookHeaders(signature, timestamp, webhookId);
    const webhookPayload = unwrapWebhookPayload(client, rawBody, headers);

    if (!webhookPayload) {
      return errorResponse(
        401,
        "AuthenticationError",
        "Invalid signature",
        builder
      );
    }

    if (!webhookPayload.type || !webhookPayload.data) {
      return errorResponse(
        400,
        "ParseError",
        "Invalid webhook payload shape",
        builder
      );
    }

    if (webhookPayload.type !== "payment.succeeded") {
      return ignoredResponse(builder);
    }

    const { payment_id, checkout_session_id } = webhookPayload.data;
    const creditAmount = Math.round(webhookPayload.data.total_amount);

    builder.setWebhookContext({
      webhookEvent: webhookPayload.type,
      orderId: payment_id,
    });

    if (!checkout_session_id) {
      return errorResponse(
        400,
        "ValidationError",
        "Missing checkout_session_id in webhook payload",
        builder
      );
    }

    const session = await getSessionByCheckoutId(checkout_session_id);

    if (!session) {
      return errorResponse(
        404,
        "NotFoundError",
        `Session not found for checkout_session_id: ${checkout_session_id}`,
        builder
      );
    }

    if (session.processed) {
      return ignoredResponse(builder);
    }

    const userId = session.userId;
    const billedUpto = session.billed_upto;
    const apiKeyId = session.apiKeyId;
    const mode = session.mode;

    const db = getPostgresDB();
    await executeInTransaction(db, "process checkout", async (txn) => {
      await updateUserBilledTimestamp(userId, billedUpto, txn);
      await markSessionProcessed(checkout_session_id, txn);
      await handleAddPayment(userId, creditAmount, apiKeyId, mode, txn);
      await txn
        .update(checkoutSessionsTable)
        .set({ isCompleted: true })
        .where(
          and(
            eq(checkoutSessionsTable.userId, userId),
            eq(checkoutSessionsTable.isCompleted, false)
          )
        );
    });

    builder.setUser(userId);
    builder.setPaymentContext({ creditAmount });
    builder.setSuccess(200);
    return okResponse("Webhook processed successfully");
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
