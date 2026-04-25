import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { handleOnboarding } from "./onboarding.ts";

export async function registerApiRoutes(
  server: ReturnType<typeof import("fastify")["fastify"]>
): Promise<void> {
  server.post(
    "/api/v1/internals/onboarding",
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ) => {
      return handleOnboarding(request, reply);
    }
  );
}