import type { FastifyInstance } from "fastify";
import { handleOnboarding } from "./onboarding.ts";

export async function registerApiRoutes(
  server: ReturnType<typeof import("fastify")["fastify"]>
): Promise<void> {
  server.post(
    "/api/v1/internals/onboarding",
    async (request, reply) => {
      return handleOnboarding(request, reply);
    }
  );
}