import type { FastifyRequest, FastifyReply } from "fastify";
import {
  handleCreateProject,
  handleListProjects,
  handleGetProject,
} from "./onBoarding.ts";
import { handleListTags, handleCreateTag, handleDeleteTag } from "./tags.ts";
import {
  handleListExpressions,
  handleCreateExpression,
  handleDeleteExpression,
} from "./expressions.ts";
import {
  handleCreateWebhookEndpoint,
  handleGetWebhookEndpoint,
  handleDeleteWebhookEndpoint,
  handleSendTestWebhook,
  handleGetPublicKey,
} from "./webhookEndpoints.ts";
import {
  handleCreateApiKey,
  handleListApiKeys,
  handleRevokeApiKey,
} from "./apiKeys.ts";
import { handleListDeliveries } from "./webhookDeliveries.ts";

export async function registerApiRoutes(
  server: ReturnType<(typeof import("fastify"))["fastify"]>
): Promise<void> {
  // Projects
  server.post(
    "/api/v1/internals/projects",
    async (request: FastifyRequest, reply: FastifyReply) => {
      return handleCreateProject(request, reply);
    }
  );

  server.get(
    "/api/v1/internals/projects",
    async (request: FastifyRequest, reply: FastifyReply) => {
      return handleListProjects(request, reply);
    }
  );

  server.get(
    "/api/v1/internals/projects/:projectId",
    async (
      request: FastifyRequest<{ Params: { projectId: string } }>,
      reply: FastifyReply
    ) => {
      return handleGetProject(request, reply);
    }
  );

  // Tags
  server.get(
    "/api/v1/tags",
    async (request: FastifyRequest, reply: FastifyReply) => {
      return handleListTags(request, reply);
    }
  );

  server.post(
    "/api/v1/tags",
    async (request: FastifyRequest, reply: FastifyReply) => {
      return handleCreateTag(request, reply);
    }
  );

  server.delete(
    "/api/v1/tags/:key",
    async (request: FastifyRequest, reply: FastifyReply) => {
      return handleDeleteTag(request, reply);
    }
  );

  // Expressions
  server.get(
    "/api/v1/expressions",
    async (request: FastifyRequest, reply: FastifyReply) => {
      return handleListExpressions(request, reply);
    }
  );

  server.post(
    "/api/v1/expressions",
    async (request: FastifyRequest, reply: FastifyReply) => {
      return handleCreateExpression(request, reply);
    }
  );

  server.delete(
    "/api/v1/expressions/:key",
    async (request: FastifyRequest, reply: FastifyReply) => {
      return handleDeleteExpression(request, reply);
    }
  );

  // API keys
  server.post(
    "/api/v1/api-keys",
    async (request: FastifyRequest, reply: FastifyReply) => {
      return handleCreateApiKey(request, reply);
    }
  );

  server.get(
    "/api/v1/api-keys",
    async (request: FastifyRequest, reply: FastifyReply) => {
      return handleListApiKeys(request, reply);
    }
  );

  server.delete(
    "/api/v1/api-keys/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      return handleRevokeApiKey(request, reply);
    }
  );

  // Webhook endpoints
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

  // Webhook deliveries
  server.get(
    "/api/v1/internals/webhook-deliveries",
    async (request: FastifyRequest, reply: FastifyReply) => {
      return handleListDeliveries(request, reply);
    }
  );
}
