import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import * as Sentry from "@sentry/bun";
import {
  createWideEventBuilder,
  generateRequestId,
} from "../../context/requestContext.ts";
import { logger } from "../../errors/logger.ts";
import { handleDodoWebhook } from "./createdCheckout.ts";

function extractHeaderValue(
  header: string | string[] | undefined
): string | undefined {
  return typeof header === "string"
    ? header
    : Array.isArray(header) && header.length === 1
      ? header[0]
      : undefined;
}

export async function registerWebhookRoutes(
  server: ReturnType<(typeof import("fastify"))["fastify"]>
): Promise<void> {
  server.post(
    "/webhooks/payment/createdCheckout",
    { config: { rawBody: true } },
    async (
      request: FastifyRequest & {
        rawBody?: string;
      },
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
        const webhookIdHeader = request.headers["webhook-id"];
        const signature = extractHeaderValue(signatureHeader);
        const timestamp = extractHeaderValue(timestampHeader);
        const webhookId = extractHeaderValue(webhookIdHeader);

        const requestWithRawBody = request;
        const rawBody = requestWithRawBody.rawBody;

        if (!rawBody) {
          builder.setError(400, {
            type: "ParseError",
            message: "Missing raw webhook payload",
          });
          reply.code(400);
          return { error: "Missing raw webhook payload" };
        }

        const result = await handleDodoWebhook(
          rawBody,
          signature,
          timestamp,
          webhookId,
          builder
        );

        reply.code(result.statusCode);
        return result.body;
      } catch (error) {
        Sentry.captureException(error, {
          extra: { context: "webhook route handler" },
        });
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
