import * as http from "node:http";
import type { ConnectRouter } from "@connectrpc/connect";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { createValidateInterceptor } from "@connectrpc/validate";
import { EventService } from "./gen/event/v1/event_pb.ts";
import { authInterceptor } from "./interceptors/auth.ts";
import { registerEvent } from "./routes/events/registerEvent.ts";
import { getPostgresDB } from "./storage/db/postgres/db.ts";

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

    // EventService implementation
    router.service(EventService, {
      registerEvent,
    });
  },
});

http.createServer(handler).listen(8000);
console.log("Server listening on http://localhost:8000");
