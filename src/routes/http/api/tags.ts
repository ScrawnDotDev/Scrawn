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
import {
  listTags,
  createTag,
  deleteTag,
} from "../../../storage/db/postgres/helpers/tags.ts";

const createTagSchema = z.object({
  key: z.string().min(1, "Tag key is required").max(128),
  amount: z
    .number()
    .int("Amount must be an integer")
    .nonnegative("Amount must be non-negative"),
});

const tagParamsSchema = z.object({
  key: z.string().min(1, "Tag key is required"),
});

interface ListTagsResponse {
  tags: string[];
}

interface MessageResponse {
  message: string;
}

export async function handleListTags(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<ListTagsResponse> {
  const builder = createWideEventBuilder(
    generateRequestId(),
    request.method,
    request.url
  );

  try {
    const authHeader = request.headers.authorization;
    await authenticateHttpApiKey(authHeader);

    const tags = await listTags();

    builder.setSuccess(200).addContext({ tagCount: tags.length });
    reply.code(200);
    return { tags };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "list tags route handler" },
    });

    if (error instanceof AuthError) {
      builder.setError(401, { type: error.type, message: error.message });
      reply.code(401);
      return { tags: [] };
    }

    const err = error instanceof Error ? error : new Error(String(error));
    builder.setError(500, { type: "InternalError", message: err.message });
    reply.code(500);
    return { tags: [] };
  } finally {
    logger.emit(builder.build());
  }
}

export async function handleCreateTag(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<MessageResponse | { error: string }> {
  const builder = createWideEventBuilder(
    generateRequestId(),
    request.method,
    request.url
  );

  try {
    const authHeader = request.headers.authorization;
    await authenticateHttpApiKey(authHeader);

    const body = await request.body;
    const validated = createTagSchema.parse(body);

    await createTag(validated.key, validated.amount);

    builder.setSuccess(200);
    reply.code(200);
    return { message: `Tag '${validated.key}' saved` };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "create tag route handler" },
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

export async function handleDeleteTag(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<MessageResponse | { error: string }> {
  const builder = createWideEventBuilder(
    generateRequestId(),
    request.method,
    request.url
  );

  try {
    const authHeader = request.headers.authorization;
    await authenticateHttpApiKey(authHeader);

    const params = tagParamsSchema.parse(request.params);
    const deleted = await deleteTag(params.key);

    if (!deleted) {
      builder.setError(404, {
        type: "NotFoundError",
        message: `Tag '${params.key}' not found`,
      });
      reply.code(404);
      return { error: `Tag '${params.key}' not found` };
    }

    builder.setSuccess(200);
    reply.code(200);
    return { message: `Tag '${params.key}' disabled` };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "delete tag route handler" },
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
