import * as grpc from "@grpc/grpc-js";
import * as authGrpc from "../gen/auth/v1/auth";
import * as eventGrpc from "../gen/event/v1/event";
import * as paymentGrpc from "../gen/payment/v1/payment";
import * as queryGrpc from "../gen/query/v1/query";
import * as dataGrpc from "../gen/data/v1/data";
import { createAPIKey } from "../routes/gRPC/auth/createAPIKey";
import { registerEvent } from "../routes/gRPC/events/registerEvent";
import { streamEvents } from "../routes/gRPC/events/streamEvents";
import { createCheckoutLink } from "../routes/gRPC/payment/createCheckoutLink";
import { queryEvents } from "../routes/gRPC/query/queryEvents";
import { queryData } from "../routes/gRPC/data/query";
import { logger } from "../errors/logger";
import {
  authInterceptor,
  type GrpcHandler,
  type GrpcUntypedHandler,
} from "../interceptors/auth";
import { loggingInterceptor } from "../interceptors/logging";

export interface GrpcTlsOptions {
  cert: Buffer;
  key: Buffer;
  ca?: Buffer;
}

export function startRawGrpcServer(
  grpcPort: number,
  tlsOptions?: GrpcTlsOptions
): Promise<grpc.Server> {
  const server = new grpc.Server();

  // Wrap handlers with interceptors - cast to GrpcUntypedHandler to accept flexible call types
  const wrappedCreateAPIKey = loggingInterceptor(
    "/auth.v1.AuthService/CreateAPIKey",
    authInterceptor(
      "/auth.v1.AuthService/CreateAPIKey",
      createAPIKey as GrpcHandler<unknown, unknown>
    )
  ) as GrpcUntypedHandler;

  const wrappedRegisterEvent = loggingInterceptor(
    "/event.v1.EventService/RegisterEvent",
    authInterceptor(
      "/event.v1.EventService/RegisterEvent",
      registerEvent as GrpcHandler<unknown, unknown>
    )
  ) as GrpcUntypedHandler;

  const wrappedStreamEvents = loggingInterceptor(
    "/event.v1.EventService/StreamEvents",
    authInterceptor(
      "/event.v1.EventService/StreamEvents",
      streamEvents as GrpcHandler<unknown, unknown>
    )
  ) as GrpcUntypedHandler;

  const wrappedCreateCheckoutLink = loggingInterceptor(
    "/payment.v1.PaymentService/CreateCheckoutLink",
    authInterceptor(
      "/payment.v1.PaymentService/CreateCheckoutLink",
      createCheckoutLink as GrpcHandler<unknown, unknown>
    )
  ) as GrpcUntypedHandler;

  const wrappedQueryEvents = loggingInterceptor(
    "/query.v1.QueryService/QueryEvents",
    authInterceptor(
      "/query.v1.QueryService/QueryEvents",
      queryEvents as GrpcHandler<unknown, unknown>
    )
  ) as GrpcUntypedHandler;

  const wrappedQueryData = loggingInterceptor(
    "/data.v1.DataQueryService/Query",
    authInterceptor(
      "/data.v1.DataQueryService/Query",
      queryData as GrpcHandler<unknown, unknown>
    )
  ) as GrpcUntypedHandler;

  server.addService(authGrpc.AuthServiceService, {
    createApiKey: wrappedCreateAPIKey,
  });

  server.addService(eventGrpc.EventServiceService, {
    registerEvent: wrappedRegisterEvent,
    streamEvents: wrappedStreamEvents,
  });

  server.addService(paymentGrpc.PaymentServiceService, {
    createCheckoutLink: wrappedCreateCheckoutLink,
  });

  server.addService(queryGrpc.QueryServiceService, {
    queryEvents: wrappedQueryEvents,
  });

  server.addService(dataGrpc.DataQueryServiceService, {
    query: wrappedQueryData,
  });

  const credentials = tlsOptions
    ? grpc.ServerCredentials.createSsl(
        tlsOptions.ca ?? null,
        [
          {
            cert_chain: tlsOptions.cert,
            private_key: tlsOptions.key,
          },
        ],
        false
      )
    : grpc.ServerCredentials.createInsecure();

  return new Promise((resolve, reject) => {
    server.bindAsync(`0.0.0.0:${grpcPort}`, credentials, (error, port) => {
      if (error) {
        logger.fatal("Failed to start gRPC server", error as Error);
        reject(error);
        return;
      }
      logger.lifecycle("gRPC server listening", {
        url: `0.0.0.0:${port}`,
      });
      resolve(server);
    });
  });
}
