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
import { getPostgresDB } from "../../../storage/db/postgres/db";
import {
  webhookDeliveriesTable,
  webhookEndpointsTable,
  apiKeysTable,
} from "../../../storage/db/postgres/schema";
import { eq, desc, inArray } from "drizzle-orm";

const listDeliveriesQuerySchema = z.object({
  apiKeyId: z.string().uuid("Invalid API key ID").optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function handleListDeliveries(
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

    const query = listDeliveriesQuerySchema.parse(request.query);
    const db = getPostgresDB();

    let conditions = undefined;
    if (query.apiKeyId) {
      const endpoints = await db
        .select({ id: webhookEndpointsTable.id })
        .from(webhookEndpointsTable)
        .where(eq(webhookEndpointsTable.apiKeyId, query.apiKeyId));
      const ids = endpoints.map((e) => e.id);
      if (ids.length > 0) {
        conditions = inArray(webhookDeliveriesTable.endpointId, ids);
      } else {
        conditions = eq(webhookDeliveriesTable.endpointId, "");
      }
    }

    const rows = await db
      .select({
        id: webhookDeliveriesTable.id,
        eventId: webhookDeliveriesTable.eventId,
        eventType: webhookDeliveriesTable.eventType,
        resource: webhookDeliveriesTable.resource,
        action: webhookDeliveriesTable.action,
        status: webhookDeliveriesTable.status,
        requestBody: webhookDeliveriesTable.requestBody,
        responseStatus: webhookDeliveriesTable.responseStatus,
        error: webhookDeliveriesTable.error,
        createdAt: webhookDeliveriesTable.createdAt,
        endpointUrl: webhookEndpointsTable.url,
        apiKeyName: apiKeysTable.name,
        apiKeyRole: apiKeysTable.role,
      })
      .from(webhookDeliveriesTable)
      .leftJoin(
        webhookEndpointsTable,
        eq(webhookDeliveriesTable.endpointId, webhookEndpointsTable.id)
      )
      .leftJoin(
        apiKeysTable,
        eq(webhookEndpointsTable.apiKeyId, apiKeysTable.id)
      )
      .where(conditions)
      .orderBy(desc(webhookDeliveriesTable.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    builder.setSuccess(200);
    reply.code(200);
    return { deliveries: rows };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "list webhook deliveries handler" },
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
