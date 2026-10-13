import type { FastifyRequest, FastifyReply } from "fastify";
import * as Sentry from "@sentry/bun";
import DodoPayments from "dodopayments";
import { removeClient } from "../../gRPC/payment/paymentProvider.ts";
import {
  createWideEventBuilder,
  generateRequestId,
} from "../../../context/requestContext.ts";
import { logger } from "../../../errors/logger.ts";
import { AuthError } from "../../../errors/auth";
import { authenticateMasterApiKey } from "../../../utils/authenticateMasterApiKey.ts";
import { apiKeyCache } from "../../../utils/apiKeyCache.ts";
import { getPostgresDB } from "../../../storage/db/postgres/db";
import {
  projectsTable,
  metadataTable,
  apiKeysTable,
  usersTable,
  sessionsTable,
  basicUsageEventsTable,
  aiTokenUsageEventsTable,
  paymentEventsTable,
  webhookDeliveriesTable,
  webhookEndpointsTable,
  tagsTable,
  expressionsTable,
  eventIdempotencyKeysTable,
} from "../../../storage/db/postgres/schema";
import { eq, inArray } from "drizzle-orm";
import { encrypt, decrypt } from "../../../utils/encryptMetadata.ts";
import { executeInTransaction } from "../../../storage/adapter/postgres/handlers/addEventUtils";

function maskApiKey(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.length <= 16) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
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
    authenticateMasterApiKey(request.headers.authorization);

    const body = (await request.body) as { projectIds: string[] };
    if (!body || !Array.isArray(body.projectIds)) {
      builder.setError(400, {
        type: "BadRequestError",
        message: "Missing projectIds array",
      });
      reply.code(400);
      return {};
    }

    if (body.projectIds.length === 0) {
      builder.setSuccess(200);
      reply.code(200);
      return { projects: [] };
    }

    const db = getPostgresDB();
    const projects = await db
      .select({
        id: projectsTable.id,
        name: projectsTable.name,
        dodo_live_api_key: metadataTable.dodo_live_api_key,
        dodo_test_api_key: metadataTable.dodo_test_api_key,
        dodo_live_product_id: metadataTable.dodo_live_product_id,
        dodo_test_product_id: metadataTable.dodo_test_product_id,
        currency: metadataTable.currency,
        redirect_url: metadataTable.redirect_url,
      })
      .from(projectsTable)
      .leftJoin(metadataTable, eq(projectsTable.id, metadataTable.projectId))
      .where(inArray(projectsTable.id, body.projectIds));

    builder.setSuccess(200);
    reply.code(200);

    return {
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        dodoLiveApiKey: p.dodo_live_api_key
          ? maskApiKey(decrypt(p.dodo_live_api_key))
          : null,
        dodoTestApiKey: p.dodo_test_api_key
          ? maskApiKey(decrypt(p.dodo_test_api_key))
          : null,
        dodoLiveProductId: p.dodo_live_product_id,
        dodoTestProductId: p.dodo_test_product_id,
        currency: p.currency,
        redirectUrl: p.redirect_url,
      })),
    };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "handleListProjects" },
    });
    if (error instanceof AuthError) {
      builder.setError(401, { type: error.type, message: error.message });
      reply.code(401);
      return {};
    }
    const err = error instanceof Error ? error : new Error(String(error));
    builder.setError(500, { type: "InternalError", message: err.message });
    reply.code(500);
    return {};
  } finally {
    logger.emit(builder.build());
  }
}

export async function handleUpdateProject(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<Record<string, unknown>> {
  const builder = createWideEventBuilder(
    generateRequestId(),
    request.method,
    request.url
  );

  const cleanupTasks: Array<() => Promise<void>> = [];

  try {
    authenticateMasterApiKey(request.headers.authorization);

    const { projectId } = request.params as { projectId: string };
    const body = (await request.body) as {
      name?: string;
      dodoLiveProductId?: string;
      dodoTestProductId?: string;
      currency?: string;
      redirectUrl?: string;
      dodoLiveApiKey?: string;
      dodoTestApiKey?: string;
    };

    const db = getPostgresDB();

    const metaUpdates: any = {};
    if (body.dodoLiveProductId !== undefined)
      metaUpdates.dodo_live_product_id = body.dodoLiveProductId;
    if (body.dodoTestProductId !== undefined)
      metaUpdates.dodo_test_product_id = body.dodoTestProductId;
    if (body.currency !== undefined) metaUpdates.currency = body.currency;
    if (body.redirectUrl !== undefined)
      metaUpdates.redirect_url = body.redirectUrl;

    if (body.dodoLiveApiKey && !body.dodoLiveApiKey.includes("****")) {
      metaUpdates.dodo_live_api_key = encrypt(body.dodoLiveApiKey);

      const liveClient = new DodoPayments({
        bearerToken: body.dodoLiveApiKey,
        environment: "live_mode",
      });

      const appUrl = process.env.APP_URL;
      if (!appUrl) {
        builder.setError(500, {
          type: "InternalError",
          message: "APP_URL environment variable is not set",
        });
        reply.code(500);
        return {};
      }

      try {
        const liveWebhook = await liveClient.webhooks.create({
          url: `${appUrl}/webhooks/payment/createdCheckout?mode=production&projectId=${projectId}`,
          description: "Scrawn live payment webhook",
          filter_types: ["payment.succeeded", "payment.failed"],
        });
        cleanupTasks.push(async () => {
          try {
            await liveClient.webhooks.delete(liveWebhook.id);
          } catch (e) {
            Sentry.captureException(e, {
              extra: { context: "failed to clean up live webhook on rollback" },
            });
          }
        });
        const liveSecret = (
          await liveClient.webhooks.retrieveSecret(liveWebhook.id)
        ).secret;
        metaUpdates.dodo_live_webhook_secret = encrypt(liveSecret);
      } catch (error) {
        Sentry.captureException(error, {
          extra: { context: "failed to register live webhook on update" },
        });
        throw new Error("FAILED_TO_REGISTER_LIVE_WEBHOOK");
      }
    }

    if (body.dodoTestApiKey && !body.dodoTestApiKey.includes("****")) {
      metaUpdates.dodo_test_api_key = encrypt(body.dodoTestApiKey);

      const testClient = new DodoPayments({
        bearerToken: body.dodoTestApiKey,
        environment: "test_mode",
      });

      const appUrl = process.env.APP_URL;
      if (!appUrl) {
        builder.setError(500, {
          type: "InternalError",
          message: "APP_URL environment variable is not set",
        });
        reply.code(500);
        return {};
      }

      try {
        const testWebhook = await testClient.webhooks.create({
          url: `${appUrl}/webhooks/payment/createdCheckout?mode=test&projectId=${projectId}`,
          description: "Scrawn test payment webhook",
          filter_types: ["payment.succeeded", "payment.failed"],
        });
        cleanupTasks.push(async () => {
          try {
            await testClient.webhooks.delete(testWebhook.id);
          } catch (e) {
            Sentry.captureException(e, {
              extra: { context: "failed to clean up test webhook on rollback" },
            });
          }
        });
        const testSecret = (
          await testClient.webhooks.retrieveSecret(testWebhook.id)
        ).secret;
        metaUpdates.dodo_test_webhook_secret = encrypt(testSecret);
      } catch (error) {
        Sentry.captureException(error, {
          extra: { context: "failed to register test webhook on update" },
        });
        throw new Error("FAILED_TO_REGISTER_TEST_WEBHOOK");
      }
    }

    await executeInTransaction(db, "update project", async (txn) => {
      const exists = await txn
        .select({ id: projectsTable.id })
        .from(projectsTable)
        .where(eq(projectsTable.id, projectId))
        .limit(1);
      if (exists.length === 0) {
        throw new Error("PROJECT_NOT_FOUND");
      }

      if (body.name !== undefined) {
        await txn
          .update(projectsTable)
          .set({ name: body.name })
          .where(eq(projectsTable.id, projectId));
      }

      if (Object.keys(metaUpdates).length > 0) {
        const updated = await txn
          .update(metadataTable)
          .set(metaUpdates)
          .where(eq(metadataTable.projectId, projectId))
          .returning({ projectId: metadataTable.projectId });

        if (updated.length === 0) {
          await txn.insert(metadataTable).values({
            projectId,
            ...metaUpdates,
          });
        }
      }
    });

    removeClient(projectId);

    builder.setSuccess(200);
    reply.code(200);
    return { success: true };
  } catch (error) {
    if (cleanupTasks.length > 0) {
      await Promise.allSettled(cleanupTasks.map((task) => task()));
    }

    Sentry.captureException(error, {
      extra: { context: "handleUpdateProject" },
    });
    if (error instanceof AuthError) {
      builder.setError(401, { type: error.type, message: error.message });
      reply.code(401);
      return {};
    }
    const err = error instanceof Error ? error : new Error(String(error));
    if (
      err.name === "StorageError" &&
      (err as any).originalError?.message === "PROJECT_NOT_FOUND"
    ) {
      builder.setError(404, {
        type: "NotFoundError",
        message: "Project not found",
      });
      reply.code(404);
      return {};
    }
    if (
      err.name === "StorageError" &&
      (err as any).originalError?.code === "23505"
    ) {
      builder.setError(409, {
        type: "ConflictError",
        message: "A project with this name already exists",
      });
      reply.code(409);
      return {};
    }
    builder.setError(500, { type: "InternalError", message: err.message });
    reply.code(500);
    return {};
  } finally {
    logger.emit(builder.build());
  }
}

export async function handleDeleteProject(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<Record<string, unknown>> {
  const builder = createWideEventBuilder(
    generateRequestId(),
    request.method,
    request.url
  );

  try {
    authenticateMasterApiKey(request.headers.authorization);

    const { projectId } = request.params as { projectId: string };
    const db = getPostgresDB();

    await executeInTransaction(db, "delete project", async (txn) => {
      await txn
        .delete(webhookDeliveriesTable)
        .where(eq(webhookDeliveriesTable.projectId, projectId));
      await txn
        .delete(webhookEndpointsTable)
        .where(eq(webhookEndpointsTable.projectId, projectId));
      await txn
        .delete(basicUsageEventsTable)
        .where(eq(basicUsageEventsTable.projectId, projectId));
      await txn
        .delete(paymentEventsTable)
        .where(eq(paymentEventsTable.projectId, projectId));
      await txn
        .delete(aiTokenUsageEventsTable)
        .where(eq(aiTokenUsageEventsTable.projectId, projectId));
      await txn
        .delete(sessionsTable)
        .where(eq(sessionsTable.projectId, projectId));
      await txn.delete(usersTable).where(eq(usersTable.projectId, projectId));
      await txn.delete(tagsTable).where(eq(tagsTable.projectId, projectId));
      await txn
        .delete(eventIdempotencyKeysTable)
        .where(eq(eventIdempotencyKeysTable.projectId, projectId));
      await txn
        .delete(expressionsTable)
        .where(eq(expressionsTable.projectId, projectId));
      const deletedKeys = await txn
        .delete(apiKeysTable)
        .where(eq(apiKeysTable.projectId, projectId))
        .returning({ key: apiKeysTable.key });

      for (const k of deletedKeys) {
        apiKeyCache.delete(k.key);
      }
      await txn
        .delete(metadataTable)
        .where(eq(metadataTable.projectId, projectId));
      const deletedProject = await txn
        .delete(projectsTable)
        .where(eq(projectsTable.id, projectId))
        .returning({ id: projectsTable.id });

      if (deletedProject.length === 0) {
        throw new Error("PROJECT_NOT_FOUND");
      }
    });

    removeClient(projectId);

    builder.setSuccess(200);
    reply.code(200);
    return { success: true };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "handleDeleteProject" },
    });
    if (error instanceof AuthError) {
      builder.setError(401, { type: error.type, message: error.message });
      reply.code(401);
      return {};
    }
    const err = error instanceof Error ? error : new Error(String(error));
    if (
      err.name === "StorageError" &&
      (err as any).originalError?.message === "PROJECT_NOT_FOUND"
    ) {
      builder.setError(404, {
        type: "NotFoundError",
        message: "Project not found",
      });
      reply.code(404);
      return {};
    }
    builder.setError(500, { type: "InternalError", message: err.message });
    reply.code(500);
    return {};
  } finally {
    logger.emit(builder.build());
  }
}
