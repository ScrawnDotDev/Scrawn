import { createContextKey } from "@connectrpc/connect";

export const apiKeyContextKey = createContextKey<string | null>(null);
