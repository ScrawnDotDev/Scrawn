import { type Interceptor } from "@connectrpc/connect";
import jwt from "jsonwebtoken";
import { userContextKey } from "../context/auth";
import { type UserPayload } from "../types/auth";

const no_auth = ["/auth.v1.AuthService/SignJWT"];

export function authInterceptor(secret: string): Interceptor {
  return (next) => async (req) => {
    for (const path of no_auth) {
      if (req.url.endsWith(path)) {
        return await next(req);
      }
    }

    const authorization = req.header.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      throw new Error("Missing or invalid Authorization header");
    }

    const token = authorization.slice("Bearer ".length);

    try {
      const decoded = jwt.verify(token, secret) as UserPayload;
      // attach user info to context for use in handlers
      req.contextValues.set(userContextKey, decoded);
    } catch (err) {
      throw new Error("Invalid or expired token");
    }

    return await next(req);
  };
}
