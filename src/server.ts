import * as http from "node:http";
import type { ConnectRouter } from "@connectrpc/connect";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { createValidateInterceptor } from "@connectrpc/validate";
import { AuthService } from "./gen/auth/v1/auth_pb.ts";
import { authInterceptor } from "./interceptors/auth.ts";
import { signJWT } from "./routes/auth/signJWT.ts";
import { getRoles } from "./routes/auth/getRoles.ts";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is not set");
}

const handler = connectNodeAdapter({
  interceptors: [createValidateInterceptor(), authInterceptor(JWT_SECRET)],
  routes: (router: ConnectRouter) => {
    // AuthService implementation
    router.service(AuthService, {
      signJWT,
      getRoles,
    });
  },
});

http.createServer(handler).listen(8000);
console.log("Server listening on http://localhost:8000");
