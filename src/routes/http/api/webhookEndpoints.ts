import type { FastifyRequest, FastifyReply } from "fastify";
import * as Sentry from "@sentry/bun";
import { ZodError } from "zod";
import { z } from "zod";
import {
  createWideEventBuilder,
  generateRequestId,
} from "../../../context/requestContext.ts";
import { logger } from "../../../errors/logger.ts";
import { AuthError } from "../../../errors/auth.ts";
import { authenticateHttpApiKey } from "../../../utils/authenticateHttpApiKey.ts";
import { generateWebhookKeyPair } from "../../../utils/generateWebhookKeyPair.ts";
import {
  getWebhookEndpointByApiKeyId,
  upsertWebhookEndpoint,
  deleteWebhookEndpoint,
} from "../../../storage/db/postgres/helpers/webhookEndpoints.ts";
import { getApiKeyRoleById } from "../../../storage/db/postgres/helpers/apiKeys.ts";
import { invalidateWebhookEndpointCache } from "../../../interceptors/auth.ts";
import { forwardWebhook } from "../forwardWebhook.ts";
import { DateTime } from "luxon";

const createEndpointSchema = z.object({
  url: z.string().url("Must be a valid URL").max(2048, "URL too long"),
  apiKeyId: z.string().uuid("Invalid API key ID").optional(),
});

const sendTestSchema = z.object({
  apiKeyId: z.string().uuid("Invalid API key ID"),
});

interface WebhookEndpointResponse {
  id: string;
  url: string;
  publicKey: string;
  apiKeyId: string;
  createdAt: string;
  updatedAt: string;
}

interface WebhookEndpointListResponse {
  endpoints: WebhookEndpointResponse[];
}

interface PublicKeyResponse {
  publicKey: string;
}

interface MessageResponse {
  message: string;
}

function toEndpointResponse(
  endpoint: NonNullable<
    Awaited<ReturnType<typeof getWebhookEndpointByApiKeyId>>
  >
): WebhookEndpointResponse {
  return {
    id: endpoint.id,
    url: endpoint.url,
    publicKey: endpoint.publicKey,
    apiKeyId: endpoint.apiKeyId,
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
  };
}

export async function handleCreateWebhookEndpoint(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<WebhookEndpointResponse | { error: string }> {
  const builder = createWideEventBuilder(
    generateRequestId(),
    request.method,
    request.url
  );

  try {
    const auth = await authenticateHttpApiKey(request.headers.authorization);
    builder.setApiKeyContext({ name: `webhook:${auth.apiKeyId}` });

    const body = await request.body;
    const validated = createEndpointSchema.parse(body);

    const targetApiKeyId =
      validated.apiKeyId && auth.role === "dashboard"
        ? validated.apiKeyId
        : auth.apiKeyId;

    if (targetApiKeyId !== auth.apiKeyId && auth.role !== "dashboard") {
      builder.setError(403, {
        type: "PermissionDenied",
        message: "Only dashboard keys can set webhooks for other keys",
      });
      reply.code(403);
      return { error: "Only dashboard keys can set webhooks for other keys" };
    }

    const targetKey = await getApiKeyRoleById(targetApiKeyId);
    if (!targetKey) {
      builder.setError(404, {
        type: "NotFoundError",
        message: "Target API key not found",
      });
      reply.code(404);
      return { error: "Target API key not found" };
    }

    if (targetKey.role === "dashboard") {
      builder.setError(400, {
        type: "ValidationError",
        message: "Cannot set webhook on a dashboard key",
      });
      reply.code(400);
      return { error: "Cannot set webhook on a dashboard key" };
    }

    if (
      targetKey.role === "production" &&
      !validated.url.startsWith("https://")
    ) {
      builder.setError(400, {
        type: "ValidationError",
        message: "Only HTTPS URLs are allowed for production keys",
      });
      reply.code(400);
      return { error: "Only HTTPS URLs are allowed for production keys" };
    }

    const keyPair = generateWebhookKeyPair();

    const endpoint = await upsertWebhookEndpoint(
      targetApiKeyId,
      validated.url,
      keyPair.privateKeyPem,
      keyPair.publicKeyPrefixed,
      auth.project_id
    );

    invalidateWebhookEndpointCache(targetApiKeyId);

    builder.setSuccess(200);
    reply.code(200);
    return toEndpointResponse(endpoint);
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "create webhook endpoint handler" },
    });

    if (error instanceof AuthError) {
      builder.setError(401, { type: error.type, message: error.message });
      reply.code(401);
      return { error: error.message };
    }

    if (error instanceof ZodError) {
      const issues = error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      builder.setError(400, { type: "ValidationError", message: issues });
      reply.code(400);
      return { error: issues };
    }

    const err = error instanceof Error ? error : new Error(String(error));
    builder.setError(500, { type: "InternalError", message: err.message });
    reply.code(500);
    return { error: "Internal server error" };
  } finally {
    logger.emit(builder.build());
  }
}

export async function handleGetWebhookEndpoint(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<WebhookEndpointListResponse | { error: string }> {
  const builder = createWideEventBuilder(
    generateRequestId(),
    request.method,
    request.url
  );

  try {
    const auth = await authenticateHttpApiKey(request.headers.authorization);
    builder.setApiKeyContext({ name: `webhook:${auth.apiKeyId}` });

    const endpoint = await getWebhookEndpointByApiKeyId(auth.apiKeyId);

    const endpoints: WebhookEndpointResponse[] = endpoint
      ? [toEndpointResponse(endpoint)]
      : [];

    builder.setSuccess(200);
    reply.code(200);
    return { endpoints };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "get webhook endpoint handler" },
    });

    if (error instanceof AuthError) {
      builder.setError(401, { type: error.type, message: error.message });
      reply.code(401);
      return { error: error.message };
    }

    const err = error instanceof Error ? error : new Error(String(error));
    builder.setError(500, { type: "InternalError", message: err.message });
    reply.code(500);
    return { error: "Internal server error" };
  } finally {
    logger.emit(builder.build());
  }
}

export async function handleDeleteWebhookEndpoint(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<MessageResponse | { error: string }> {
  const builder = createWideEventBuilder(
    generateRequestId(),
    request.method,
    request.url
  );

  try {
    const auth = await authenticateHttpApiKey(request.headers.authorization);
    builder.setApiKeyContext({ name: `webhook:${auth.apiKeyId}` });

    const deleted = await deleteWebhookEndpoint(auth.apiKeyId);

    if (!deleted) {
      builder.setError(404, {
        type: "NotFoundError",
        message: "No webhook endpoint found for this API key",
      });
      reply.code(404);
      return { error: "No webhook endpoint found for this API key" };
    }

    invalidateWebhookEndpointCache(auth.apiKeyId);

    builder.setSuccess(200);
    reply.code(200);
    return { message: "Webhook endpoint disabled" };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "delete webhook endpoint handler" },
    });

    if (error instanceof AuthError) {
      builder.setError(401, { type: error.type, message: error.message });
      reply.code(401);
      return { error: error.message };
    }

    const err = error instanceof Error ? error : new Error(String(error));
    builder.setError(500, { type: "InternalError", message: err.message });
    reply.code(500);
    return { error: "Internal server error" };
  } finally {
    logger.emit(builder.build());
  }
}

export async function handleSendTestWebhook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<MessageResponse | { error: string }> {
  const builder = createWideEventBuilder(
    generateRequestId(),
    request.method,
    request.url
  );

  try {
    const auth = await authenticateHttpApiKey(request.headers.authorization);
    builder.setApiKeyContext({ name: `webhook:${auth.apiKeyId}` });

    if (auth.role !== "dashboard") {
      builder.setError(403, {
        type: "PermissionDenied",
        message: "Only the dashboard can send test webhooks",
      });
      reply.code(403);
      return { error: "Only the dashboard can send test webhooks" };
    }

    const body = await request.body;
    const validated = sendTestSchema.parse(body);

    const targetKey = await getApiKeyRoleById(validated.apiKeyId);
    if (!targetKey) {
      builder.setError(404, {
        type: "NotFoundError",
        message: "API key not found",
      });
      reply.code(404);
      return { error: "API key not found" };
    }

    if (targetKey.role !== "test") {
      builder.setError(400, {
        type: "ValidationError",
        message: "Can only send test webhooks to test API keys",
      });
      reply.code(400);
      return { error: "Can only send test webhooks to test API keys" };
    }

    const endpoint = await getWebhookEndpointByApiKeyId(validated.apiKeyId);

    if (!endpoint) {
      builder.setError(404, {
        type: "NotFoundError",
        message: "No webhook endpoint configured for this API key",
      });
      reply.code(404);
      return { error: "No webhook endpoint configured for this API key" };
    }

    const now = DateTime.utc();

    await forwardWebhook(validated.apiKeyId, {
      eventType: "payment.succeeded",
      resource: "payment",
      action: "succeeded",
      data: {
        paymentId: "test_pay_000000000000000000000",
        checkoutSessionId: "test_cks_0000000000000000000",
        userId: "test-user-00000000-0000-0000-0000-000000000000",
        amount: 1000,
        currency: "usd",
        mode: "test",
        billed_upto: now.toISO(),
        createdAt: now.toISO(),
      },
    });

    builder.setSuccess(200);
    reply.code(200);
    return { message: "Test webhook sent" };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "send test webhook handler" },
    });

    if (error instanceof AuthError) {
      builder.setError(401, { type: error.type, message: error.message });
      reply.code(401);
      return { error: error.message };
    }

    const err = error instanceof Error ? error : new Error(String(error));
    builder.setError(500, { type: "InternalError", message: err.message });
    reply.code(500);
    return { error: "Internal server error" };
  } finally {
    logger.emit(builder.build());
  }
}

export async function handleGetPublicKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<PublicKeyResponse | { error: string }> {
  const builder = createWideEventBuilder(
    generateRequestId(),
    request.method,
    request.url
  );

  try {
    const auth = await authenticateHttpApiKey(request.headers.authorization);
    builder.setApiKeyContext({ name: `webhook:${auth.apiKeyId}` });

    const endpoint = await getWebhookEndpointByApiKeyId(auth.apiKeyId);

    if (!endpoint) {
      builder.setError(404, {
        type: "NotFoundError",
        message: "No webhook endpoint configured for this API key",
      });
      reply.code(404);
      return { error: "No webhook endpoint configured for this API key" };
    }

    builder.setSuccess(200);
    reply.code(200);
    return { publicKey: endpoint.publicKey };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "get public key handler" },
    });

    if (error instanceof AuthError) {
      builder.setError(401, { type: error.type, message: error.message });
      reply.code(401);
      return { error: error.message };
    }

    const err = error instanceof Error ? error : new Error(String(error));
    builder.setError(500, { type: "InternalError", message: err.message });
    reply.code(500);
    return { error: "Internal server error" };
  } finally {
    logger.emit(builder.build());
  }
}
