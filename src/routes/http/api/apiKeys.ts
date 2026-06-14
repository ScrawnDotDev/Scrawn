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
import { generateAPIKey } from "../../../utils/generateAPIKey";
import { hashAPIKey } from "../../../utils/hashAPIKey";
import { DateTime } from "luxon";
import { createApiKey } from "../../../storage/db/postgres/helpers/apiKeys";
import { upsertWebhookEndpoint } from "../../../storage/db/postgres/helpers/webhookEndpoints";
import { generateWebhookKeyPair } from "../../../utils/generateWebhookKeyPair";
import { getPostgresDB } from "../../../storage/db/postgres/db";
import {
  apiKeysTable,
  webhookEndpointsTable,
} from "../../../storage/db/postgres/schema";
import { eq, and, isNull, ne, sql } from "drizzle-orm";
import type { ApiKeyRole } from "../../../utils/keyFormat";
import { invalidateWebhookEndpointCache } from "../../../interceptors/auth";

const createApiKeySchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  role: z.enum(["test", "production"]),
  expiresIn: z
    .number()
    .int()
    .min(60)
    .max(365 * 24 * 60 * 60),
  webhookUrl: z.string().url("Invalid webhook URL").max(2048),
});

export async function handleCreateApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<Record<string, unknown> | { error: string }> {
  const builder = createWideEventBuilder(
    generateRequestId(),
    request.method,
    request.url
  );

  try {
    const auth = await authenticateHttpApiKey(request.headers.authorization);
    builder.setApiKeyContext({ name: `create-key:${auth.apiKeyId}` });

    const body = await request.body;
    const validated = createApiKeySchema.parse(body);

    const apiKey = generateAPIKey(validated.role as ApiKeyRole);
    const apiKeyHash = hashAPIKey(apiKey);
    const now = DateTime.utc();
    const expiresAt = now.plus({ seconds: validated.expiresIn });

    const keyRecord = await createApiKey({
      name: validated.name,
      key: apiKeyHash,
      role: validated.role,
      expiresAt: expiresAt.toISO(),
      project_id: auth.project_id,
    });

    const keyPair = generateWebhookKeyPair();
    const endpoint = await upsertWebhookEndpoint(
      keyRecord.id,
      validated.webhookUrl,
      keyPair.privateKeyPem,
      keyPair.publicKeyPrefixed,
      auth.project_id
    );
    invalidateWebhookEndpointCache(keyRecord.id);

    builder.setSuccess(200);
    reply.code(200);
    return {
      id: keyRecord.id,
      name: validated.name,
      key: apiKey,
      role: validated.role,
      expiresAt: expiresAt.toISO(),
      webhookEndpoint: {
        id: endpoint.id,
        url: endpoint.url,
        publicKey: endpoint.publicKey,
      },
    };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "create API key handler" },
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

export async function handleListApiKeys(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<Record<string, unknown> | { error: string }> {
  const builder = createWideEventBuilder(
    generateRequestId(),
    request.method,
    request.url
  );

  try {
    await authenticateHttpApiKey(request.headers.authorization);

    const db = getPostgresDB();
    const keys = await db
      .select({
        id: apiKeysTable.id,
        name: apiKeysTable.name,
        role: apiKeysTable.role,
        createdAt: apiKeysTable.createdAt,
        expiresAt: apiKeysTable.expiresAt,
        revoked: apiKeysTable.revoked,
        webhookUrl: webhookEndpointsTable.url,
        webhookPublicKey: webhookEndpointsTable.publicKey,
        webhookEndpointId: webhookEndpointsTable.id,
      })
      .from(apiKeysTable)
      .leftJoin(
        webhookEndpointsTable,
        and(
          eq(apiKeysTable.id, webhookEndpointsTable.apiKeyId),
          isNull(webhookEndpointsTable.deletedAt)
        )
      )
      .where(
        and(ne(apiKeysTable.role, "dashboard"), eq(apiKeysTable.revoked, false))
      )
      .orderBy(apiKeysTable.createdAt);

    builder.setSuccess(200);
    reply.code(200);
    return { keys };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "list API keys handler" },
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

export async function handleRevokeApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<Record<string, unknown> | { error: string }> {
  const builder = createWideEventBuilder(
    generateRequestId(),
    request.method,
    request.url
  );

  try {
    await authenticateHttpApiKey(request.headers.authorization);

    const params = request.params as { id: string };
    const db = getPostgresDB();
    const now = DateTime.utc().toISO();

    const result = await db
      .update(apiKeysTable)
      .set({ revoked: true, revokedAt: now })
      .where(
        and(eq(apiKeysTable.id, params.id), eq(apiKeysTable.revoked, false))
      );

    if ((result.count ?? 0) === 0) {
      builder.setError(404, {
        type: "NotFoundError",
        message: "API key not found or already revoked",
      });
      reply.code(404);
      return { error: "API key not found or already revoked" };
    }

    builder.setSuccess(200);
    reply.code(200);
    return { message: "API key revoked" };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "revoke API key handler" },
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
