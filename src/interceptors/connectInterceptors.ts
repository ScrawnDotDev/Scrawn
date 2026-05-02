import type { Interceptor } from "@connectrpc/connect";
import { loggingInterceptor } from "./logging.ts";
import { authInterceptor } from "./auth.ts";

export function createConnectInterceptors(): Interceptor[] {
  return [loggingInterceptor(), authInterceptor()];
}
