import { fastify } from "fastify";
import fastifyRawBody from "fastify-raw-body";
import { fastifyConnectPlugin } from "@connectrpc/connect-fastify";
import { registerGrpcRoutes } from "../routes/gRPC/registerRoutes.ts";
import { createConnectInterceptors } from "../interceptors/connectInterceptors.ts";
import { registerWebhookRoutes } from "../routes/http/registerWebhookRoutes.ts";
import { registerApiRoutes } from "../routes/http/api/registerApiRoutes.ts";
import { logger } from "../errors/logger.ts";

export async function startFastifyServer(port: number, grpcPort: number): Promise<void> {
  const server = fastify({
    http2: true,
  });

  await server.register(fastifyConnectPlugin, {
    interceptors: createConnectInterceptors(),
    routes: registerGrpcRoutes,
  });

  await server.register(fastifyRawBody, {
    field: "rawBody",
    global: false,
    encoding: "utf8",
    runFirst: true,
  });

  server.get("/", async (_request, reply) => {
    reply.type("text/plain");
    return "Hello World!";
  });

  await registerWebhookRoutes(server);
  await registerApiRoutes(server);

  await server.listen({ host: "localhost", port });

  logger.lifecycle("Server started", {
    httpPort: port,
    grpcH2Port: grpcPort,
    env: process.env.NODE_ENV || "development",
  });
  logger.lifecycle("Webhook endpoint available", {
    url: `http://localhost:${port}/webhooks/lemonsqueezy/createdCheckout`,
  });
  logger.lifecycle("API endpoint available", {
    url: `http://localhost:${port}/api/v1/internals/onboarding`,
  });
  logger.lifecycle("Connect endpoint available", {
    url: `http://localhost:${port}`,
  });
}
