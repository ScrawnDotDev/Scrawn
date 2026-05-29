import * as Sentry from "@sentry/bun";
import { createPrivateKey, randomUUID, sign } from "node:crypto";
import { DateTime } from "luxon";
import { getPostgresDB } from "../../storage/db/postgres/db";
import { getWebhookEndpointByApiKeyId } from "../../storage/db/postgres/helpers/webhookEndpoints";
import { webhookDeliveriesTable } from "../../storage/db/postgres/schema";

const STANDARD_WEBHOOKS_VERSION = "v1a";

function generateWebhookId(): string {
  return `msg_${randomUUID().replace(/-/g, "")}`;
}

function normalizePem(pem: string): string {
  return pem.replace(/\\n/g, "\n");
}

function signPayload(payload: string, privateKeyPem: string): string {
  const normalizedPem = normalizePem(privateKeyPem);
  const privateKey = createPrivateKey(normalizedPem);
  return sign(null, Buffer.from(payload), privateKey).toString("base64");
}

function buildSignedPayload(
  webhookId: string,
  timestamp: number,
  body: string
): string {
  return `${webhookId}.${timestamp}.${body}`;
}

export interface WebhookForwardEvent {
  eventType: string;
  resource: string;
  action: string;
  data: Record<string, unknown>;
  rawData?: Record<string, unknown>;
}

export async function forwardWebhook(
  apiKeyId: string,
  event: WebhookForwardEvent
): Promise<void> {
  const endpoint = await getWebhookEndpointByApiKeyId(apiKeyId);

  if (!endpoint) {
    return;
  }

  const webhookId = generateWebhookId();
  const now = DateTime.utc();
  const timestamp = Math.floor(now.toSeconds());

  const bodyObj: Record<string, unknown> = {
    type: event.eventType,
    timestamp: now.toISO(),
    data: event.data,
  };
  if (event.rawData) {
    bodyObj.raw_data = event.rawData;
  }
  const body = JSON.stringify(bodyObj);

  const signedPayload = buildSignedPayload(webhookId, timestamp, body);

  let signature: string;
  try {
    signature = signPayload(signedPayload, endpoint.privateKey);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Signing failed";
    Sentry.captureException(error, {
      extra: { context: "webhook signing failed", error: errorMsg },
    });
    await recordDelivery(endpoint.id, webhookId, event, "failed", {
      error: errorMsg,
    });
    return;
  }

  const signatureHeader = `${STANDARD_WEBHOOKS_VERSION},${signature}`;

  let responseStatus: number | null = null;
  let errorMessage: string | null = null;

  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "webhook-id": webhookId,
        "webhook-timestamp": String(timestamp),
        "webhook-signature": signatureHeader,
      },
      body,
      signal: AbortSignal.timeout(5_000),
    });

    responseStatus = response.status;

    if (!response.ok) {
      errorMessage = `Webhook returned non-2xx status: ${response.status}`;
      Sentry.captureMessage(errorMessage, {
        level: "warning",
        extra: { endpointId: endpoint.id, webhookId },
      });
    }
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "Unknown webhook delivery error";
    Sentry.captureException(error, {
      extra: {
        context: "webhook delivery failed",
        endpointId: endpoint.id,
        error: errorMessage,
      },
    });
  }

  await recordDelivery(
    endpoint.id,
    webhookId,
    event,
    errorMessage ? "failed" : "delivered",
    {
      responseStatus,
      error: errorMessage,
    }
  );
}

async function recordDelivery(
  endpointId: string,
  eventId: string,
  event: WebhookForwardEvent,
  status: "delivered" | "failed",
  details: {
    responseStatus?: number | null;
    error?: string | null;
  }
): Promise<void> {
  try {
    const db = getPostgresDB();
    await db.insert(webhookDeliveriesTable).values({
      endpointId,
      eventId,
      eventType: event.eventType,
      resource: event.resource,
      action: event.action,
      status,
      requestBody: event.data as Record<string, unknown>,
      responseStatus: details.responseStatus ?? null,
      error: details.error ?? null,
    });
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "failed to record webhook delivery" },
    });
  }
}
