import { createContextKey } from "@connectrpc/connect";
import { type UserPayload } from "../types/auth";

export const userContextKey = createContextKey<UserPayload | null>(null);
