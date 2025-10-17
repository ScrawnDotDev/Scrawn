import { createContextKey } from "@connectrpc/connect";
import { type UserPayload } from "../interceptors/auth.js";

export const userContextKey = createContextKey<UserPayload>({});
