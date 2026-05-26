import type { FastifyRequest, FastifyReply } from "fastify";
import * as Sentry from "@sentry/bun";
import {
  createWideEventBuilder,
  generateRequestId,
} from "../../../context/requestContext.ts";
import { logger } from "../../../errors/logger.ts";
import { AuthError } from "../../../errors/auth.ts";
import { authenticateHttpApiKey } from "../../../utils/authenticateHttpApiKey.ts";
import { listExpressions } from "../../../storage/db/postgres/helpers/expressions.ts";

interface ListExpressionsResponse {
  expressions: string[];
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
      builder.setError(401, {
        type: error.type,
        message: error.message,
      });
      reply.code(401);
      return { expressions: [] };
    }

    const err = error instanceof Error ? error : new Error(String(error));
    builder.setError(500, {
      type: "InternalError",
      message: err.message,
    });
    reply.code(500);
    return { expressions: [] };
  } finally {
    logger.emit(builder.build());
  }
}
