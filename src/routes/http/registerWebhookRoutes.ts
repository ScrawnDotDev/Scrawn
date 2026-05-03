import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createWideEventBuilder, generateRequestId } from "../../context/requestContext.ts";
import { logger } from "../../errors/logger.ts";
import { handleDodoWebhook } from "./createdCheckout.ts";

export async function registerWebhookRoutes(
  server: ReturnType<typeof import("fastify")["fastify"]>
): Promise<void> {
  server.post(
    "/webhooks/payment/createdCheckout",
    { config: { rawBody: true } },
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ) => {
      const builder = createWideEventBuilder(
        generateRequestId(),
        request.method,
        request.url
      );

      try {
        const signatureHeader = request.headers["webhook-signature"];
        const timestampHeader = request.headers["webhook-timestamp"];
        const signature =
          typeof signatureHeader === "string"
            ? signatureHeader
            : Array.isArray(signatureHeader)
              ? signatureHeader[0]
              : undefined;
        const timestamp =
          typeof timestampHeader === "string"
            ? timestampHeader
            : Array.isArray(timestampHeader)
              ? timestampHeader[0]
              : undefined;

        const requestWithRawBody = request as typeof request & {
          rawBody?: string;
        };
        const rawBody = requestWithRawBody.rawBody;

        if (!rawBody) {
          builder.setError(400, {
            type: "ParseError",
            message: "Missing raw webhook payload",
          });
          reply.code(400);
          return { error: "Missing raw webhook payload" };
        }

        const result = await handleDodoWebhook(rawBody, signature, timestamp, builder);

        reply.code(result.statusCode);
        return result.body;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        builder.setError(500, {
          type: "InternalError",
          message: err.message,
        });
        reply.code(500);
        return { error: "Internal server error" };
      } finally {
        logger.emit(builder.build());
      }
    }
  );
}
