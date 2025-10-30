import * as http from "node:http";
import type { ConnectRouter } from "@connectrpc/connect";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { createValidateInterceptor } from "@connectrpc/validate";
import { AuthService } from "./gen/auth/v1/auth_pb.ts";
import { EventService } from "./gen/event/v1/event_pb.ts";
import { authInterceptor } from "./interceptors/auth.ts";
import { signJWT } from "./routes/auth/signJWT.ts";
import { getRoles } from "./routes/auth/getRoles.ts";
import { registerEvent } from "./routes/events/registerEvent.ts";
import { getPostgresDB } from "./storage/postgres.ts";

const JWT_SECRET = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is not set");
}

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined in environment variables");
}

getPostgresDB(DATABASE_URL);

const handler = connectNodeAdapter({
  interceptors: [createValidateInterceptor(), authInterceptor(JWT_SECRET)],
  routes: (router: ConnectRouter) => {
    // AuthService implementation
    router.service(AuthService, {
      signJWT,
      getRoles,
    });

    // EventService implementation
    router.service(EventService, {
      registerEvent,
    });
  },
});

http.createServer(handler).listen(8000);
console.log("Server listening on http://localhost:8000");
