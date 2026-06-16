import { z } from "zod";
import * as Sentry from "@sentry/bun";
import { ZodError } from "zod";
import type { FastifyRequest, FastifyReply } from "fastify";
import {
  createWideEventBuilder,
  generateRequestId,
} from "../../../context/requestContext";
import { authenticateHttpApiKey } from "../../../utils/authenticateHttpApiKey";
import { createProject } from "./../../../storage/db/postgres/helpers/projects";
import { AuthError } from "../../../errors/auth";
import { logger } from "../../../errors/logger";

const checkProject = z.object({
  product_id: z.string().min(1, "Product ID is required").max(128),
});

export async function handleCreateProject(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const builder = createWideEventBuilder(
    generateRequestId(),
    request.method,
    request.url
  );

  try {
    const authHeader = request.headers.authorization;
    const { project_id, role } = await authenticateHttpApiKey(authHeader);

    if (role !== "dashboard") {
      throw AuthError.permissionDenied(
        "Only dashboard keys can manage projects"
      );
    }

    const body = await request.body;
    const validated = checkProject.parse(body);

    await createProject(project_id, validated.product_id);

    builder.setSuccess(200);
    reply.code(200);
    return { message: `Project '${project_id}' saved` };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { context: "create project route handler" },
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
