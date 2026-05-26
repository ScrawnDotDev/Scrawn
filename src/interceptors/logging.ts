import { status as grpcStatus } from "@grpc/grpc-js";
import type { sendUnaryData, ServerErrorResponse } from "@grpc/grpc-js";
import * as Sentry from "@sentry/bun";
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

    Sentry.addBreadcrumb({
      category: "request",
      message: `gRPC: ${url}`,
      data: { requestId, method },
      level: "info",
    });

    // Wrap callback to capture errors
    const originalCallback = callback;
    const wrappedCallback: sendUnaryData<unknown> = (
      error,
      response,
      trailer,
      flags
    ) => {
      if (error) {
        const errorDetails = extractErrorDetails(error);
        const statusCode = grpcStatusToHttpStatus(errorDetails.code);

        Sentry.captureException(error, {
          extra: { requestId, method: url, statusCode },
        });

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
    if (result && typeof result.then === "function") {
      return result.catch((error: unknown) => {
        if (!builder["event"].outcome) {
          const errorDetails = extractErrorDetails(error);
          const statusCode = grpcStatusToHttpStatus(errorDetails.code);

          Sentry.captureException(error, {
            extra: { requestId, method: url, statusCode },
          });

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

function grpcStatusToHttpStatus(code: number): number {
  switch (code) {
    case grpcStatus.CANCELLED:
      return 499;
    case grpcStatus.UNKNOWN:
      return 500;
    case grpcStatus.INVALID_ARGUMENT:
      return 400;
    case grpcStatus.DEADLINE_EXCEEDED:
      return 504;
    case grpcStatus.NOT_FOUND:
      return 404;
    case grpcStatus.ALREADY_EXISTS:
      return 409;
    case grpcStatus.PERMISSION_DENIED:
      return 403;
    case grpcStatus.RESOURCE_EXHAUSTED:
      return 429;
    case grpcStatus.FAILED_PRECONDITION:
      return 400;
    case grpcStatus.ABORTED:
      return 409;
    case grpcStatus.OUT_OF_RANGE:
      return 400;
    case grpcStatus.UNIMPLEMENTED:
      return 501;
    case grpcStatus.INTERNAL:
      return 500;
    case grpcStatus.UNAVAILABLE:
      return 503;
    case grpcStatus.DATA_LOSS:
      return 500;
    case grpcStatus.UNAUTHENTICATED:
      return 401;
    default:
      return 500;
  }
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
      code:
        "code" in error
          ? (error as { code: number }).code
          : grpcStatus.INTERNAL,
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
