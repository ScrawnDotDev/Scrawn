import type { FastifyRequest, FastifyReply } from "fastify";
import * as Sentry from "@sentry/bun";
import { ZodError } from "zod";
import DodoPayments from "dodopayments";
import {
  createWideEventBuilder,
  generateRequestId,
} from "../../../context/requestContext.ts";
import { logger } from "../../../errors/logger.ts";
import { AuthError } from "../../../errors/auth.ts";
import { authenticateHttpApiKey } from "../../../utils/authenticateHttpApiKey.ts";
import {
  createProject,
  listProjects,
  getProject,
} from "../../../storage/db/postgres/helpers/projects.ts";
import {
  upsertMetadata,
  getMetadata,
} from "../../../storage/db/postgres/helpers/metadata.ts";
import { clearClients } from "../../gRPC/payment/paymentProvider.ts";
import { encrypt, decrypt } from "../../../utils/encryptMetadata.ts";
import { z } from "zod";

const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  dodoLiveApiKey: z.string().min(1),
  dodoTestApiKey: z.string().min(1),
  dodoLiveProductId: z.string().min(1),
  dodoTestProductId: z.string().min(1),
  currency: z.string().min(1),
  redirectUrl: z.string().url(),
});

export async function handleCreateProject(
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

    const body = await request.body;
    const validated = createProjectSchema.parse(body);

    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      builder.setError(500, {
        type: "ConfigError",
        message: "APP_URL environment variable is not set",
      });
      reply.code(500);
      return { error: "APP_URL not set" };
    }

    const projectResult = await createProject(validated.name);
    const projectId = projectResult.id;

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
        url: `${appUrl}/webhooks/payment/createdCheckout/${projectId}?mode=production`,
        description: `Scrawn live payment webhook for ${validated.name}`,
        filter_types: ["payment.succeeded", "payment.failed"],
      });
      liveSecret = (await liveClient.webhooks.retrieveSecret(liveWebhook.id))
        .secret;

      const testWebhook = await testClient.webhooks.create({
        url: `${appUrl}/webhooks/payment/createdCheckout/${projectId}?mode=test`,
        description: `Scrawn test payment webhook for ${validated.name}`,
        filter_types: ["payment.succeeded", "payment.failed"],
      });
      testSecret = (await testClient.webhooks.retrieveSecret(testWebhook.id))
        .secret;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      Sentry.captureException(error, {
        extra: { context: "dodo webhook registration for project" },
      });
      builder.setError(400, {
        type: "DodoApiError",
        message: `Failed to register webhook with Dodo: ${errMsg}`,
      });
      reply.code(400);
      return { error: `Failed to register webhook with Dodo: ${errMsg}` };
    }

    await upsertMetadata({
      projectId,
      dodo_live_api_key: encrypt(validated.dodoLiveApiKey),
      dodo_test_api_key: encrypt(validated.dodoTestApiKey),
      dodo_live_product_id: validated.dodoLiveProductId,
      dodo_test_product_id: validated.dodoTestProductId,
      dodo_live_webhook_secret: encrypt(liveSecret),
      dodo_test_webhook_secret: encrypt(testSecret),
      currency: validated.currency,
      redirect_url: validated.redirectUrl,
    });

    clearClients(projectId);

    builder.setSuccess(200);

    reply.code(201);
    return { id: projectId };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "create project handler" },
    });

    if (error instanceof AuthError) {
      builder.setError(401, {
        type: error.type,
        message: error.message,
      });
      reply.code(401);
      return { error: error.message };
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
      return { error: issues };
    }

    const err = error instanceof Error ? error : new Error(String(error));
    builder.setError(500, {
      type: "InternalError",
      message: err.message,
    });
    reply.code(500);
    return { error: err.message };
  } finally {
    logger.emit(builder.build());
  }
}

export async function handleListProjects(
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

    const projects = await listProjects();

    builder.setSuccess(200);
    reply.code(200);
    return { projects };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "list projects handler" },
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
      message: "Failed to list projects",
    });
    reply.code(500);
    return { error: "Internal server error" };
  } finally {
    logger.emit(builder.build());
  }
}

function maskApiKey(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.length <= 16) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
}

export async function handleGetProject(
  request: FastifyRequest<{ Params: { projectId: string } }>,
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

    const projectId = request.params.projectId;
    if (!projectId) {
      reply.code(400);
      return { error: "Missing projectId" };
    }

    const project = await getProject(projectId);
    if (!project) {
      reply.code(404);
      return { error: "Project not found" };
    }

    const metadata = await getMetadata(projectId);

    if (!metadata) {
      builder.setSuccess(200);
      reply.code(200);
      return { project, configured: false };
    }

    builder.setSuccess(200);
    reply.code(200);
    return {
      project,
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
    };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "get project handler" },
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
      message: "Failed to read project config",
    });
    reply.code(500);
    return { error: "Internal server error" };
  } finally {
    logger.emit(builder.build());
  }
}
