import * as http from "node:http";
import * as http2 from "node:http2";
import type { ConnectRouter } from "@connectrpc/connect";
import { connectNodeAdapter } from "@connectrpc/connect-node";
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
import { withHttpLogging } from "./middleware/httpLogging.ts";
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

const grpcHandler = connectNodeAdapter({
  interceptors: [
    loggingInterceptor(), // First - captures all requests including auth failures
    createValidateInterceptor(),
    authInterceptor(),
  ],
  routes: (router: ConnectRouter) => {
    // EventService implementation
    router.service(EventService, {
      registerEvent,
      streamEvents,
    });

    // AuthService implementation
    router.service(AuthService, {
      createAPIKey,
    });

    // PaymentService implementation
    router.service(PaymentService, {
      createCheckoutLink,
    });
  },
});

// Wrap webhook handler with HTTP logging middleware
const webhookHandler = withHttpLogging(handleLemonSqueezyWebhook);

// Create a combined handler for both gRPC and HTTP webhooks
const requestHandler = (
  req: http.IncomingMessage | http2.Http2ServerRequest,
  res: http.ServerResponse | http2.Http2ServerResponse
) => {
  // Handle webhook endpoint
  if (
    req.url === "/webhooks/lemonsqueezy/createdCheckout" &&
    req.method === "POST"
  ) {
    webhookHandler(
      req as unknown as http.IncomingMessage,
      res as unknown as http.ServerResponse
    );
    return;
  }

  // Handle all other requests as gRPC
  grpcHandler(req, res);
};

const PORT = Number(process.env.PORT ?? 8069);

http2.createServer(requestHandler).listen(PORT);

logger.lifecycle("Server started", {
  grpcH2Port: PORT,
  env: process.env.NODE_ENV || "development",
});
logger.lifecycle("Webhook endpoint available", {
  url: `http://localhost:${PORT}/webhooks/lemonsqueezy/createdCheckout`,
});
logger.lifecycle("gRPC h2c endpoint available", {
  url: `http://localhost:${PORT}`,
});
