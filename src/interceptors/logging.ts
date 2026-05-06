import { status as grpcStatus } from "@grpc/grpc-js";
import type { sendUnaryData, ServerErrorResponse } from "@grpc/grpc-js";
import { logger } from "../errors/logger";
import {
  wideEventContextKey,
  generateRequestId,
  createWideEventBuilder,
} from "../context/requestContext";
import type { GrpcFlexibleHandler } from "./auth";

/**
 * Logging interceptor for gRPC - implements wide events pattern
 */
export function loggingInterceptor(
  methodPath: string,
  handler: GrpcFlexibleHandler
): GrpcFlexibleHandler {
  return (call, callback?: sendUnaryData<unknown>) => {
    const requestId = generateRequestId();
    const method = "unary"; // Simplified - can detect stream type from handler signature
    const url = methodPath.startsWith("/") ? methodPath : `/${methodPath}`;

    const builder = createWideEventBuilder(requestId, method, url);

    // Attach builder to call object
    call[wideEventContextKey] = builder;

    // Wrap callback to capture errors
    const originalCallback = callback;
    const wrappedCallback: sendUnaryData<unknown> = (error, response, trailer, flags) => {
      if (error) {
        const errorDetails = extractErrorDetails(error);
        const statusCode = grpcStatusToHttpStatus(errorDetails.code);

        builder.setError(statusCode, {
          type: errorDetails.type,
          message: errorDetails.message,
          cause: errorDetails.cause,
          stack: errorDetails.stack,
        });
      } else {
        builder.setSuccess(200);
      }

      const event = builder.build();
      logger.emit(event);

      if (originalCallback) {
        originalCallback(error, response, trailer, flags);
      }
    };

    const result = handler(call, wrappedCallback);

    // Handle async handlers that might throw
    if (result && typeof result.then === 'function') {
      return result.catch((error: unknown) => {
        if (!builder['event'].outcome) {
          const errorDetails = extractErrorDetails(error);
          const statusCode = grpcStatusToHttpStatus(errorDetails.code);
          builder.setError(statusCode, {
            type: errorDetails.type,
            message: errorDetails.message,
            cause: errorDetails.cause,
            stack: errorDetails.stack,
          });
          const event = builder.build();
          logger.emit(event);
        }
        throw error;
      });
    }
  };
}

const GRPC_TO_HTTP_STATUS: Record<number, number> = {
  [grpcStatus.CANCELLED]: 499,
  [grpcStatus.UNKNOWN]: 500,
  [grpcStatus.INVALID_ARGUMENT]: 400,
  [grpcStatus.DEADLINE_EXCEEDED]: 504,
  [grpcStatus.NOT_FOUND]: 404,
  [grpcStatus.ALREADY_EXISTS]: 409,
  [grpcStatus.PERMISSION_DENIED]: 403,
  [grpcStatus.RESOURCE_EXHAUSTED]: 429,
  [grpcStatus.FAILED_PRECONDITION]: 400,
  [grpcStatus.ABORTED]: 409,
  [grpcStatus.OUT_OF_RANGE]: 400,
  [grpcStatus.UNIMPLEMENTED]: 501,
  [grpcStatus.INTERNAL]: 500,
  [grpcStatus.UNAVAILABLE]: 503,
  [grpcStatus.DATA_LOSS]: 500,
  [grpcStatus.UNAUTHENTICATED]: 401,
};

function grpcStatusToHttpStatus(code: number): number {
  return GRPC_TO_HTTP_STATUS[code] ?? 500;
}

interface ErrorDetails {
  type: string;
  message: string;
  cause?: string;
  code: number;
  stack?: string;
}

const isDev = process.env.NODE_ENV !== "production";

function extractErrorDetails(error: unknown): ErrorDetails {
  if (error instanceof Error) {
    return {
      type: error.name,
      message: error.message,
      cause: error.cause instanceof Error ? error.cause.message : undefined,
      code: "code" in error ? (error as { code: number }).code : grpcStatus.INTERNAL,
      stack: isDev ? error.stack : undefined,
    };
  }

  return {
    type: "UnknownError",
    message: String(error),
    cause: undefined,
    code: grpcStatus.INTERNAL,
  };
}
