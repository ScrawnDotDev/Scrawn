import * as http2 from "node:http2";
import type { ConnectRouter } from "@connectrpc/connect";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { fastify } from "fastify";
import fastifyRawBody from "fastify-raw-body";
import { fastifyConnectPlugin } from "@connectrpc/connect-fastify";
import { createValidateInterceptor } from "@connectrpc/validate";
import { EventService } from "./gen/event/v1/event_pb.ts";
import { AuthService } from "./gen/auth/v1/auth_pb.ts";
import { PaymentService } from "./gen/payment/v1/payment_pb.ts";
import { loggingInterceptor } from "./interceptors/logging.ts";
import { authInterceptor } from "./interceptors/auth.ts";
import { registerEvent } from "./routes/gRPC/events/registerEvent.ts";
import { streamEvents } from "./routes/gRPC/events/streamEvents.ts";
import { createAPIKey } from "./routes/gRPC/auth/createAPIKey.ts";
import { createCheckoutLink } from "./routes/gRPC/payment/createCheckoutLink.ts";
import { getPostgresDB } from "./storage/db/postgres/db.ts";
import { handleLemonSqueezyWebhook } from "./routes/http/createdCheckout.ts";
import {
  createWideEventBuilder,
  generateRequestId,
} from "./context/requestContext.ts";
import { logger } from "./errors/logger.ts";

const DATABASE_URL = process.env.DATABASE_URL;
const HMAC_SECRET = process.env.HMAC_SECRET;

if (!DATABASE_URL) {
  logger.fatal("DATABASE_URL is not defined in environment variables");
  throw new Error("DATABASE_URL is not defined in environment variables");
}

if (!HMAC_SECRET) {
  logger.fatal("HMAC_SECRET environment variable is not set");
  throw new Error("HMAC_SECRET environment variable is not set");
}

getPostgresDB(DATABASE_URL);

const PORT = Number(process.env.PORT ?? 8069);
const GRPC_PORT = Number(process.env.GRPC_PORT ?? 8070);

function registerRoutes(router: ConnectRouter): void {
  router.service(EventService, {
    registerEvent,
    streamEvents,
  });

  router.service(AuthService, {
    createAPIKey,
  });

  router.service(PaymentService, {
    createCheckoutLink,
  });
}

function startRawGrpcServer(): void {
  const grpcHandler = connectNodeAdapter({
    interceptors: [
      loggingInterceptor(),
      createValidateInterceptor(),
      authInterceptor(),
    ],
    routes: registerRoutes,
  });

  http2.createServer(grpcHandler).listen(GRPC_PORT);

  logger.lifecycle("Raw gRPC h2c endpoint available", {
    url: `http://localhost:${GRPC_PORT}`,
  });
}

async function main(): Promise<void> {
  startRawGrpcServer();

  const server = fastify({
    http2: true,
  });

  await server.register(fastifyConnectPlugin, {
    interceptors: [
      loggingInterceptor(), // First - captures all requests including auth failures
      createValidateInterceptor(),
      authInterceptor(),
    ],
    routes: registerRoutes,
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

  server.post(
    "/webhooks/lemonsqueezy/createdCheckout",
    { config: { rawBody: true } },
    async (request, reply) => {
    const builder = createWideEventBuilder(
      generateRequestId(),
      request.method,
      request.url
    );

    try {
      const signatureHeader = request.headers["x-signature"];
      const signature =
        typeof signatureHeader === "string"
          ? signatureHeader
          : Array.isArray(signatureHeader)
            ? signatureHeader[0]
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

      const result = await handleLemonSqueezyWebhook(
        rawBody,
        signature,
        builder
      );

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

  await server.listen({ host: "localhost", port: PORT });

  logger.lifecycle("Server started", {
    httpPort: PORT,
    grpcH2Port: GRPC_PORT,
    env: process.env.NODE_ENV || "development",
  });
  logger.lifecycle("Webhook endpoint available", {
    url: `http://localhost:${PORT}/webhooks/lemonsqueezy/createdCheckout`,
  });
  logger.lifecycle("Connect endpoint available", {
    url: `http://localhost:${PORT}`,
  });
};

void main();
