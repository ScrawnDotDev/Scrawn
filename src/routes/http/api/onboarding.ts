import type { FastifyRequest, FastifyReply } from "fastify";
import * as Sentry from "@sentry/bun";
import { ZodError } from "zod";
import DodoPayments from "dodopayments";
import { onboardingSchema } from "../../../zod/internals.ts";
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
import { encrypt, decrypt } from "../../../utils/encryptMetadata.ts";
import { createProject } from "../../../storage/db/postgres/helpers/projects.ts";
import { executeInTransaction } from "../../../storage/adapter/postgres/handlers/addEventUtils.ts";
import { getPostgresDB } from "../../../storage/db/postgres/db.ts";

export async function handleOnboarding(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<Record<string, never>> {
  const builder = createWideEventBuilder(
    generateRequestId(),
    request.method,
    request.url
  );

  try {
    const authHeader = request.headers.authorization;
    const { project_id } = await authenticateHttpApiKey(authHeader);

    const body = await request.body;
    const validated = onboardingSchema.parse(body);

    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      builder.setError(500, {
        type: "ConfigError",
        message: "APP_URL environment variable is not set",
      });
      reply.code(500);
      return {};
    }

    const liveClient = new DodoPayments({
      bearerToken: validated.dodoLiveApiKey,
      environment: "live_mode",
    });
    const testClient = new DodoPayments({
      bearerToken: validated.dodoTestApiKey,
      environment: "test_mode",
    });

    let liveSecret: string;
    let testSecret: string;
    try {
      const liveWebhook = await liveClient.webhooks.create({
        url: `${appUrl}/webhooks/payment/createdCheckout?mode=production&project_id=${project_id}`,
        description: "Scrawn live payment webhook",
        filter_types: ["payment.succeeded", "payment.failed"],
      });
      liveSecret = (await liveClient.webhooks.retrieveSecret(liveWebhook.id))
        .secret;

      const testWebhook = await testClient.webhooks.create({
        url: `${appUrl}/webhooks/payment/createdCheckout?mode=test&project_id=${project_id}`,
        description: "Scrawn test payment webhook",
        filter_types: ["payment.succeeded", "payment.failed"],
      });
      testSecret = (await testClient.webhooks.retrieveSecret(testWebhook.id))
        .secret;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      Sentry.captureException(error, {
        extra: { context: "dodo webhook registration during onboarding" },
      });
      builder.setError(400, {
        type: "DodoApiError",
        message: `Failed to register webhook with Dodo: ${errMsg}`,
      });
      reply.code(400);
      return {};
    }

    const db = getPostgresDB();

    await executeInTransaction(
      db,
      "update db with project and metadata",
      async (txn) => {
        await createProject(project_id, validated.dodoLiveProductId, txn);
        await upsertMetadata(
          {
            dodo_live_api_key: encrypt(validated.dodoLiveApiKey),
            dodo_test_api_key: encrypt(validated.dodoTestApiKey),
            dodo_live_product_id: validated.dodoLiveProductId,
            dodo_test_product_id: validated.dodoTestProductId,
            dodo_live_webhook_secret: encrypt(liveSecret),
            dodo_test_webhook_secret: encrypt(testSecret),
            currency: validated.currency,
            redirect_url: validated.redirectUrl,
            project_id,
          },
          txn
        );
      }
    );

    clearClients(project_id);

    builder.setSuccess(200);

    reply.code(201);
    return {};
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "onboarding route handler" },
    });

    if (error instanceof AuthError) {
      builder.setError(401, {
        type: error.type,
        message: error.message,
      });
      reply.code(401);
      return {};
    }

    if (error instanceof ZodError) {
      const issues = error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      builder.setError(400, {
        type: "ValidationError",
        message: issues,
      });
      reply.code(400);
      return {};
    }

    const err = error instanceof Error ? error : new Error(String(error));
    builder.setError(500, {
      type: "InternalError",
      message: err.message,
    });
    reply.code(500);
    return {};
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
    const { project_id } = await authenticateHttpApiKey(authHeader);

    const metadata = await getMetadata(project_id);

    if (!metadata) {
      builder.setSuccess(200);
      reply.code(200);
      return { configured: false };
    }

    builder.setSuccess(200);
    reply.code(200);
    return {
      configured: true,
      dodo_live_api_key: maskApiKey(decrypt(metadata.dodo_live_api_key)),
      dodo_test_api_key: maskApiKey(decrypt(metadata.dodo_test_api_key)),
      dodo_live_product_id: metadata.dodo_live_product_id,
      dodo_test_product_id: metadata.dodo_test_product_id,
      dodo_live_webhook_secret: maskApiKey(
        decrypt(metadata.dodo_live_webhook_secret)
      ),
      dodo_test_webhook_secret: maskApiKey(
        decrypt(metadata.dodo_test_webhook_secret)
      ),
      currency: metadata.currency,
      redirect_url: metadata.redirect_url,
      project_id: metadata.project_id,
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
