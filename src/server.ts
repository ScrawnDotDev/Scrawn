import * as http from "node:http";
import type { ConnectRouter } from "@connectrpc/connect";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { createValidateInterceptor } from "@connectrpc/validate";
import jwt from "jsonwebtoken";
import { AuthService } from "./gen/auth/v1/auth_pb.ts";
import { type UserPayload } from "./types/auth.ts";
import { authInterceptor } from "./interceptors/auth.ts";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is not set");
}

const handler = connectNodeAdapter({
  interceptors: [createValidateInterceptor(), authInterceptor(JWT_SECRET)],
  routes: (router: ConnectRouter) => {
    // AuthService implementation
    router.service(AuthService, {
      signJWT(req) {
        try {
          console.log("=== SignJWT Request ===");
          console.log("Payload:", req.payload);
          console.log("Payload type:", typeof req.payload);

          if (!req.payload) {
            throw new Error("Payload is required");
          }

          console.log("Creating UserPayload...");
          const payload: UserPayload = {
            id: req.payload.id || "",
            roles: Array.isArray(req.payload.roles) ? req.payload.roles : [],
            iat:
              parseInt(req.payload.iat.toString()) ||
              parseInt(Math.floor(Date.now() / 1000).toString()),
          };

          console.log("Payload constructed:", payload);

          const secret = req.secret;
          console.log("Signing with secret length:", secret.length);

          const token = jwt.sign(payload, secret, {
            algorithm: "HS256",
          });

          console.log("Token generated successfully");

          return { token };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const stack = error instanceof Error ? error.stack : "";
          console.error("=== SignJWT Error ===");
          console.error("Message:", errorMessage);
          console.error("Stack:", stack);
          throw new Error(`Failed to sign JWT: ${errorMessage}`);
        }
      },
      getRoles(req) {
        try {
          console.log("=== GetRoles Request ===");
          console.log("Token:", req.token.substring(0, 20) + "...");

          const secret = JWT_SECRET;

          // Verify and decode the token
          const decoded = jwt.verify(req.token, secret) as UserPayload;

          console.log("Decoded token:", decoded);

          // Extract roles array from the payload
          const roles = decoded.roles || [];

          console.log("Extracted roles:", roles);

          return { roles };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error("=== GetRoles Error ===");
          console.error("Message:", errorMessage);
          throw new Error(`Failed to extract roles from JWT: ${errorMessage}`);
        }
      },
    });
  },
});

http.createServer(handler).listen(8000);
console.log("Server listening on http://localhost:8000");
