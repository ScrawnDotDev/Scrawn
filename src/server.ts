import * as http from "node:http";
import type { ConnectRouter } from "@connectrpc/connect";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { createValidateInterceptor } from "@connectrpc/validate";
import { EventService } from "./gen/event/v1/event_pb.ts";
import { AuthService } from "./gen/auth/v1/auth_pb.ts";
import { PaymentService } from "./gen/payment/v1/payment_pb.ts";
import { authInterceptor } from "./interceptors/auth.ts";
import { registerEvent } from "./routes/events/registerEvent.ts";
import { createAPIKey } from "./routes/auth/createAPIKey.ts";
import { createCheckoutLink } from "./routes/payment/createCheckoutLink.ts";
import { getPostgresDB } from "./storage/db/postgres/db.ts";

const DATABASE_URL = process.env.DATABASE_URL;
const HMAC_SECRET = process.env.HMAC_SECRET;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined in environment variables");
}

if (!HMAC_SECRET) {
  throw new Error("HMAC_SECRET environment variable is not set");
}

getPostgresDB(DATABASE_URL);

const handler = connectNodeAdapter({
  interceptors: [createValidateInterceptor(), authInterceptor()],
  routes: (router: ConnectRouter) => {
    // EventService implementation
    router.service(EventService, {
      registerEvent,
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

http.createServer(handler).listen(8000);
console.log("Server listening on http://localhost:8000");
