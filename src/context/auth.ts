import { createContextKey } from "@connectrpc/connect";
import type { AuthSchemaType } from "../zod/auth";

export const userContextKey = createContextKey<AuthSchemaType | null>(null);
