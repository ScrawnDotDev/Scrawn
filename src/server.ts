import * as http from "node:http";
import type { ConnectRouter } from "@connectrpc/connect";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { createValidateInterceptor } from "@connectrpc/validate";
import { ElizaService } from "./gen/eliza_pb.ts";
import { authInterceptor } from "./interceptors/auth.ts";
import { userContextKey } from "./context/auth.ts";

const handler = connectNodeAdapter({
  interceptors: [createValidateInterceptor(), authInterceptor("mysecret")],
  routes: (router: ConnectRouter) => {
    router.service(ElizaService, {
      say(req, context) {
        const user = context.values.get(userContextKey);
        const displayName =
          user?.name ?? user?.username ?? user?.sub ?? "anonymous";

        return {
          sentence: `Hello ${displayName}`,
        };
      },
    });
  },
});

http.createServer(handler).listen(8000);
