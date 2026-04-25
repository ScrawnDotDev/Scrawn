import * as http2 from "node:http2";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { registerGrpcRoutes } from "../routes/gRPC/registerRoutes.ts";
import { createConnectInterceptors } from "../interceptors/connectInterceptors.ts";
import { logger } from "../errors/logger.ts";

export function startRawGrpcServer(grpcPort: number): void {
  const grpcHandler = connectNodeAdapter({
    interceptors: createConnectInterceptors(),
    routes: registerGrpcRoutes,
  });

  http2.createServer(grpcHandler).listen(grpcPort);

  logger.lifecycle("Raw gRPC h2c endpoint available", {
    url: `http://localhost:${grpcPort}`,
  });
}
