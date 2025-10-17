import { type Interceptor } from "@connectrpc/connect";
import jwt from "jsonwebtoken";
import { userContextKey } from "../context/auth";

export interface UserPayload {
  sub?: string;
  name?: string;
  username?: string;
  email?: string;
  roles?: string[];
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

export function authInterceptor(secret: string): Interceptor {
  return (next) => async (req) => {
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
