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
import { EventError } from "../../../errors/event.ts";
import { authenticateHttpApiKey } from "../../../utils/authenticateHttpApiKey.ts";
import {
  listExpressions,
  createExpression,
  deleteExpression,
} from "../../../storage/db/postgres/helpers/expressions.ts";
import {
  validateExprSyntax,
  resolveExprRefsInExpression,
} from "../../../utils/parseExpr.ts";

const createExpressionSchema = z.object({
  key: z.string().min(1, "Expression key is required").max(128),
  expr: z.string().min(1, "Expression is required").max(2048),
});

interface ListExpressionsResponse {
  expressions: string[];
}

interface MessageResponse {
  message: string;
}

export async function handleListExpressions(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<ListExpressionsResponse> {
  const builder = createWideEventBuilder(
    generateRequestId(),
    request.method,
    request.url
  );

  try {
    const authHeader = request.headers.authorization;
    await authenticateHttpApiKey(authHeader);

    const expressions = await listExpressions();

    builder.setSuccess(200).addContext({ expressionCount: expressions.length });
    reply.code(200);
    return { expressions };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "list expressions route handler" },
    });

    if (error instanceof AuthError) {
      builder.setError(401, { type: error.type, message: error.message });
      reply.code(401);
      return { expressions: [] };
    }

    const err = error instanceof Error ? error : new Error(String(error));
    builder.setError(500, { type: "InternalError", message: err.message });
    reply.code(500);
    return { expressions: [] };
  } finally {
    logger.emit(builder.build());
  }
}

export async function handleCreateExpression(
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
    const { project_id } = await authenticateHttpApiKey(authHeader);

    const body = await request.body;
    const validated = createExpressionSchema.parse(body);

    validateExprSyntax(validated.expr);
    await resolveExprRefsInExpression(validated.expr);

    await createExpression(validated.key, validated.expr, project_id);

    builder.setSuccess(200);
    reply.code(200);
    return { message: `Expression '${validated.key}' saved` };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "create expression route handler" },
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

    if (error instanceof EventError) {
      builder.setError(400, {
        type: "ValidationError",
        message: error.message,
      });
      reply.code(400);
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

export async function handleDeleteExpression(
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

    const params = request.params as { key: string };
    const deleted = await deleteExpression(params.key);

    if (!deleted) {
      builder.setError(404, {
        type: "NotFoundError",
        message: `Expression '${params.key}' not found`,
      });
      reply.code(404);
      return { error: `Expression '${params.key}' not found` };
    }

    builder.setSuccess(200);
    reply.code(200);
    return { message: `Expression '${params.key}' disabled` };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "delete expression route handler" },
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
