import type { ApiKeyRole } from "../utils/keyFormat";

export const apiKeyContextKey = Symbol.for("apiKeyContextKey");

export interface AuthContext {
  apiKeyId: string;
  role: ApiKeyRole;
  mode: "production" | "test";
}
