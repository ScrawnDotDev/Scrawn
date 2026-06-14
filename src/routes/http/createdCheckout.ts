import DodoPayments from "dodopayments";
import * as Sentry from "@sentry/bun";
import type { WideEventBuilder } from "../../context/requestContext.ts";
import { handleAddPayment } from "../../storage/db/postgres/helpers/payments";
import { getDodoClient } from "../gRPC/payment/paymentProvider.ts";
import {
  getSessionByCheckoutId,
  updateSessionStatus,
} from "../../storage/db/postgres/helpers/sessions";
import { updateUserBilledTimestamp } from "../../storage/db/postgres/helpers/users";
import { getPostgresDB } from "../../storage/db/postgres/db";
import { executeInTransaction } from "../../storage/adapter/postgres/handlers/addEventUtils";
import { forwardWebhook } from "./forwardWebhook.ts";

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
  mode: "production" | "test",
  project_id: string,
  builder: WideEventBuilder
): Promise<WebhookResponse> {
  try {
    const client = await getDodoClient(
      mode === "production" ? "production" : "test",
      project_id
    );
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

    if (
      webhookPayload.type !== "payment.failed" &&
      webhookPayload.type !== "payment.succeeded"
    ) {
      return ignoredResponse(builder);
    }

    const { payment_id, checkout_session_id } = webhookPayload.data;

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

    if (session.processed !== "pending") {
      Sentry.captureMessage(
        `Webhook received for session ${checkout_session_id} with non-pending status: ${session.processed}`,
        { level: "warning" }
      );
      return ignoredResponse(builder);
    }

    const db = getPostgresDB();

    if (webhookPayload.type === "payment.failed") {
      let claimed: boolean = false;
      await executeInTransaction(db, "process failed", async (txn) => {
        claimed = await updateSessionStatus(checkout_session_id, "failed", txn);
        if (!claimed) return;
      });
      if (!claimed) {
        Sentry.captureMessage(
          `Session ${checkout_session_id} already processed (failed path), no rows updated`,
          { level: "warning" }
        );
        return ignoredResponse(builder);
      }

      builder.setSuccess(200);
      forwardWebhook(session.apiKeyId, {
        eventType: "payment.failed",
        resource: "payment",
        action: "failed",
        data: {
          paymentId: payment_id,
          checkoutSessionId: checkout_session_id,
          userId: session.userId,
          mode: session.mode,
          createdAt: session.createdAt,
        },
        rawData: {
          business_id: webhookPayload.business_id,
          data: webhookPayload.data,
          timestamp: webhookPayload.timestamp,
          type: webhookPayload.type,
        },
      });
    }

    if (webhookPayload.type === "payment.succeeded") {
      const creditAmount = Math.round(webhookPayload.data.total_amount);
      const { userId, billed_upto, apiKeyId, mode, project_id } = session;
      let claimed: boolean = false;

      await executeInTransaction(db, "process checkout", async (txn) => {
        claimed = await updateSessionStatus(
          checkout_session_id,
          "succeeded",
          txn
        );
        if (!claimed) return;
        await updateUserBilledTimestamp(userId, billed_upto, txn);
        await handleAddPayment(
          userId,
          creditAmount,
          apiKeyId,
          mode,
          session.proxy_link_id,
          project_id,
          txn
        );
      });
      if (!claimed) {
        Sentry.captureMessage(
          `Session ${checkout_session_id} already processed (succeeded path), no rows updated`,
          { level: "warning" }
        );
        return ignoredResponse(builder);
      }

      builder.setUser(userId);
      builder.setPaymentContext({ creditAmount });
      builder.setSuccess(200);

      forwardWebhook(apiKeyId, {
        eventType: "payment.succeeded",
        resource: "payment",
        action: "succeeded",
        data: {
          paymentId: payment_id,
          checkoutSessionId: checkout_session_id,
          userId,
          amount: creditAmount,
          currency: "usd",
          mode,
          billed_upto,
          createdAt: session.createdAt,
        },
        rawData: {
          business_id: webhookPayload.business_id,
          data: webhookPayload.data,
          timestamp: webhookPayload.timestamp,
          type: webhookPayload.type,
        },
      });
    }

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
