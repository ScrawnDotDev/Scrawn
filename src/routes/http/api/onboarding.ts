import type { FastifyRequest, FastifyReply } from "fastify";
import * as Sentry from "@sentry/bun";
import { ZodError } from "zod";
import { onboardingCronSchema } from "../../../zod/internals.ts";
import { reloadScheduler } from "../../../schedulers/onboarding.ts";
import {
  createWideEventBuilder,
  generateRequestId,
} from "../../../context/requestContext.ts";
import { logger } from "../../../errors/logger.ts";
import { AuthError } from "../../../errors/auth.ts";
import { authenticateHttpApiKey } from "../../../utils/authenticateHttpApiKey.ts";
import {
  upsertMetadata,
  getMetadata,
} from "../../../storage/db/postgres/helpers/metadata.ts";
import { clearClients } from "../../gRPC/payment/paymentProvider.ts";

export async function handleOnboarding(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<{ crons: string[] }> {
  const builder = createWideEventBuilder(
    generateRequestId(),
    request.method,
    request.url
  );

  try {
    const body = await request.body;
    const validated = onboardingCronSchema.parse(body);

    const webhookUrl =
      validated.webhookUrl && validated.webhookUrl !== ""
        ? validated.webhookUrl
        : null;

    await upsertMetadata({
      payment_cron: validated.crons,
      payment_webhook: webhookUrl,
      dodo_live_api_key: validated.dodoLiveApiKey ?? undefined,
      dodo_test_api_key: validated.dodoTestApiKey ?? undefined,
      dodo_product_id: validated.dodoProductId,
      dodo_webhook_secret: validated.dodoWebhookSecret ?? undefined,
      currency: validated.currency,
      redirect_url: validated.redirectUrl,
    });

    clearClients();

    await reloadScheduler();

    builder.setSuccess(200).addContext({
      cronCount: validated.crons.length,
    });

    reply.code(201);
    return { crons: validated.crons };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "onboarding route handler" },
    });

    if (error instanceof ZodError) {
      const issues = error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      builder.setError(400, {
        type: "ValidationError",
        message: issues,
      });
      reply.code(400);
      return { crons: [] };
    }

    const err = error instanceof Error ? error : new Error(String(error));
    builder.setError(500, {
      type: "InternalError",
      message: err.message,
    });
    reply.code(500);
    return { crons: [] };
  } finally {
    logger.emit(builder.build());
  }
}

function maskApiKey(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.length <= 16) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
}

export async function handleGetConfig(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<Record<string, unknown>> {
  const builder = createWideEventBuilder(
    generateRequestId(),
    request.method,
    request.url
  );

  try {
    const authHeader = request.headers.authorization;
    await authenticateHttpApiKey(authHeader);

    const metadata = await getMetadata();

    if (!metadata) {
      builder.setSuccess(200);
      reply.code(200);
      return { configured: false };
    }

    builder.setSuccess(200);
    reply.code(200);
    return {
      configured: true,
      payment_cron: metadata.payment_cron,
      payment_webhook: metadata.payment_webhook,
      dodo_live_api_key: maskApiKey(metadata.dodo_live_api_key),
      dodo_test_api_key: maskApiKey(metadata.dodo_test_api_key),
      dodo_product_id: metadata.dodo_product_id,
      dodo_webhook_secret: maskApiKey(metadata.dodo_webhook_secret),
      currency: metadata.currency,
      redirect_url: metadata.redirect_url,
    };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "get config handler" },
    });

    if (error instanceof AuthError) {
      builder.setError(401, {
        type: error.type,
        message: error.message,
      });
      reply.code(401);
      return { error: error.message };
    }

    builder.setError(500, {
      type: "InternalError",
      message: "Failed to read config",
    });
    reply.code(500);
    return { error: "Internal server error" };
  } finally {
    logger.emit(builder.build());
  }
}
