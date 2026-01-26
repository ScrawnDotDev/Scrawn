import * as http from "node:http";
import type { ConnectRouter } from "@connectrpc/connect";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { createValidateInterceptor } from "@connectrpc/validate";
import { EventService } from "./gen/event/v1/event_pb.ts";
import { AuthService } from "./gen/auth/v1/auth_pb.ts";
import { PaymentService } from "./gen/payment/v1/payment_pb.ts";
import { authInterceptor } from "./interceptors/auth.ts";
import { registerEvent } from "./routes/gRPC/events/registerEvent.ts";
import { streamEvents } from "./routes/gRPC/events/streamEvents.ts";
import { createAPIKey } from "./routes/gRPC/auth/createAPIKey.ts";
import { createCheckoutLink } from "./routes/gRPC/payment/createCheckoutLink.ts";
import { getPostgresDB } from "./storage/db/postgres/db.ts";
import { handleLemonSqueezyWebhook as createCheckout } from "./routes/http/createdCheckout.ts";

const DATABASE_URL = process.env.DATABASE_URL;
const HMAC_SECRET = process.env.HMAC_SECRET;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined in environment variables");
}

if (!HMAC_SECRET) {
  throw new Error("HMAC_SECRET environment variable is not set");
}

getPostgresDB(DATABASE_URL);

const grpcHandler = connectNodeAdapter({
  interceptors: [createValidateInterceptor(), authInterceptor()],
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

// Create a combined handler for both gRPC and HTTP webhooks
const requestHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => {
  // Handle webhook endpoint
  if (
    req.url === "/webhooks/lemonsqueezy/createdCheckout" &&
    req.method === "POST"
  ) {
    createCheckout(req, res);
    return;
  }

  // Handle all other requests as gRPC
  grpcHandler(req, res);
};

http.createServer(requestHandler).listen(8069);
console.log("Server listening on http://localhost:8069");
console.log("Webhook endpoint: http://localhost:8069/webhooks/lemonsqueezy");
