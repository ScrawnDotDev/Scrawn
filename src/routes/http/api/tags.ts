import type { FastifyRequest, FastifyReply } from "fastify";
import * as Sentry from "@sentry/bun";
import { createWideEventBuilder, generateRequestId } from "../../../context/requestContext.ts";
import { logger } from "../../../errors/logger.ts";
import { AuthError } from "../../../errors/auth.ts";
import { authenticateHttpApiKey } from "../../../utils/authenticateHttpApiKey.ts";
import { listTags } from "../../../storage/db/postgres/helpers/tags.ts";

interface ListTagsResponse {
  tags: string[];
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
      builder.setError(401, {
        type: error.type,
        message: error.message,
      });
      reply.code(401);
      return { tags: [] };
    }

    const err = error instanceof Error ? error : new Error(String(error));
    builder.setError(500, {
      type: "InternalError",
      message: err.message,
    });
    reply.code(500);
    return { tags: [] };
  } finally {
    logger.emit(builder.build());
  }
}
