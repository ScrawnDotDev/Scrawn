import type { Interceptor } from "@connectrpc/connect";
import { ConnectError, Code } from "@connectrpc/connect";
import { logger } from "../errors/logger";
import {
  wideEventContextKey,
  generateRequestId,
  createWideEventBuilder,
} from "../context/requestContext";

/**
 * Map Connect error codes to HTTP status codes for logging.
 * Note: Code.OK (0) doesn't exist in Connect - successful responses don't throw.
 */
function connectCodeToHttpStatus(code: Code): number {
  switch (code) {
    case Code.Canceled:
      return 499;
    case Code.Unknown:
      return 500;
    case Code.InvalidArgument:
      return 400;
    case Code.DeadlineExceeded:
      return 504;
    case Code.NotFound:
      return 404;
    case Code.AlreadyExists:
      return 409;
    case Code.PermissionDenied:
      return 403;
    case Code.ResourceExhausted:
      return 429;
    case Code.FailedPrecondition:
      return 400;
    case Code.Aborted:
      return 409;
    case Code.OutOfRange:
      return 400;
    case Code.Unimplemented:
      return 501;
    case Code.Internal:
      return 500;
    case Code.Unavailable:
      return 503;
    case Code.DataLoss:
      return 500;
    case Code.Unauthenticated:
      return 401;
    default:
      return 500;
  }
}

/**
 * Extract error details from various error types.
 */
function extractErrorDetails(error: unknown): {
  type: string;
  message: string;
  cause?: string;
  code: Code;
} {
  if (error instanceof ConnectError) {
    return {
      type: (error as ConnectError & { type?: string }).type || error.name,
      message: error.message,
      cause: error.cause instanceof Error ? error.cause.message : undefined,
      code: error.code,
    };
  }

  if (error instanceof Error) {
    return {
      type: error.name,
      message: error.message,
      cause: undefined,
      code: Code.Internal,
    };
  }

  return {
    type: "UnknownError",
    message: String(error),
    cause: undefined,
    code: Code.Internal,
  };
}

/**
 * Logging interceptor that implements the wide events pattern.
 * 
 * This interceptor:
 * 1. Generates a unique request ID
 * 2. Creates a WideEventBuilder and attaches it to the request context
 * 3. Captures timing information
 * 4. Emits a single wide event at request completion (success or failure)
 * 
 * Place this interceptor FIRST in the chain to capture all requests,
 * including those that fail authentication.
 */
export function loggingInterceptor(): Interceptor {
  return (next) => async (req) => {
    const requestId = generateRequestId();
    const method = req.method.kind; // "unary", "server_streaming", "client_streaming", "bidi_streaming"
    const url = req.url;

    const builder = createWideEventBuilder(requestId, method, url);

    // Attach builder to request context for other interceptors and handlers
    req.contextValues.set(wideEventContextKey, builder);

    try {
      const response = await next(req);
      builder.setSuccess(200);
      return response;
    } catch (error) {
      const errorDetails = extractErrorDetails(error);
      const statusCode = connectCodeToHttpStatus(errorDetails.code);

      builder.setError(statusCode, {
        type: errorDetails.type,
        message: errorDetails.message,
        cause: errorDetails.cause,
      });

      throw error;
    } finally {
      const event = builder.build();
      logger.emit(event);
    }
  };
}
