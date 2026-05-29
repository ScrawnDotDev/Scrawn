import type { FastifyRequest, FastifyReply } from "fastify";
import { handleOnboarding } from "./onboarding.ts";
import { handleListTags } from "./tags.ts";
import { handleListExpressions } from "./expressions.ts";
import {
  handleCreateWebhookEndpoint,
  handleGetWebhookEndpoint,
  handleDeleteWebhookEndpoint,
  handleSendTestWebhook,
  handleGetPublicKey,
} from "./webhookEndpoints.ts";

export async function registerApiRoutes(
  server: ReturnType<(typeof import("fastify"))["fastify"]>
): Promise<void> {
  server.post(
    "/api/v1/internals/onboarding",
    async (request: FastifyRequest, reply: FastifyReply) => {
      return handleOnboarding(request, reply);
    }
  );

  server.get(
    "/api/v1/tags",
    async (request: FastifyRequest, reply: FastifyReply) => {
      return handleListTags(request, reply);
    }
  );

  server.get(
    "/api/v1/expressions",
    async (request: FastifyRequest, reply: FastifyReply) => {
      return handleListExpressions(request, reply);
    }
  );

  server.post(
    "/api/v1/internals/webhook-endpoint",
    async (request: FastifyRequest, reply: FastifyReply) => {
      return handleCreateWebhookEndpoint(request, reply);
    }
  );

  server.get(
    "/api/v1/internals/webhook-endpoint",
    async (request: FastifyRequest, reply: FastifyReply) => {
      return handleGetWebhookEndpoint(request, reply);
    }
  );

  server.delete(
    "/api/v1/internals/webhook-endpoint",
    async (request: FastifyRequest, reply: FastifyReply) => {
      return handleDeleteWebhookEndpoint(request, reply);
    }
  );

  server.get(
    "/api/v1/internals/webhook-endpoint/public-key",
    async (request: FastifyRequest, reply: FastifyReply) => {
      return handleGetPublicKey(request, reply);
    }
  );

  server.post(
    "/api/v1/internals/webhook-endpoint/send-test",
    async (request: FastifyRequest, reply: FastifyReply) => {
      return handleSendTestWebhook(request, reply);
    }
  );
}
