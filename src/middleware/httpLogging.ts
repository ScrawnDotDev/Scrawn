import type {
  IncomingMessage,
  ServerResponse,
  OutgoingHttpHeaders,
  OutgoingHttpHeader,
} from "node:http";
import { logger } from "../errors/logger";
import {
  generateRequestId,
  createWideEventBuilder,
  WideEventBuilder,
} from "../context/requestContext";

/**
 * HTTP handler type that receives a WideEventBuilder for adding context.
 */
export type LoggingHttpHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  builder: WideEventBuilder
) => Promise<void>;

/**
 * Wraps an HTTP handler with wide event logging.
 *
 * This middleware:
 * 1. Generates a unique request ID
 * 2. Creates a WideEventBuilder for the request
 * 3. Captures timing information
 * 4. Intercepts the response to capture status code
 * 5. Emits a single wide event when the response is sent
 *
 * Usage:
 * ```typescript
 * const handler = withHttpLogging(async (req, res, builder) => {
 *   builder.setUser(userId);
 *   builder.setWebhookContext({ webhookEvent: "order_created" });
 *   // ... handler logic ...
 *   res.writeHead(200);
 *   res.end(JSON.stringify({ success: true }));
 * });
 * ```
 */
export function withHttpLogging(
  handler: LoggingHttpHandler
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const requestId = generateRequestId();
    const method = req.method || "UNKNOWN";
    const url = req.url || "/";

    const builder = createWideEventBuilder(requestId, method, url);

    // Track if the response has been logged to avoid double-logging
    let logged = false;

    /**
     * Emit the wide event with current state.
     */
    const emitLog = () => {
      if (logged) return;
      logged = true;

      // Set outcome based on status code
      const statusCode = res.statusCode || 500;
      if (statusCode >= 400) {
        builder.setError(statusCode, {
          type: "HttpError",
          message: `HTTP ${statusCode}`,
        });
      } else {
        builder.setSuccess(statusCode);
      }

      const event = builder.build();
      logger.emit(event);
    };

    // Intercept writeHead to capture status code earlier
    const originalWriteHead = res.writeHead.bind(res);
    res.writeHead = function (
      statusCode: number,
      statusMessage?: string | OutgoingHttpHeaders | OutgoingHttpHeader[],
      headers?: OutgoingHttpHeaders | OutgoingHttpHeader[]
    ): ServerResponse {
      // Handle overloaded signatures
      if (typeof statusMessage === "object") {
        return originalWriteHead(statusCode, statusMessage);
      }
      return originalWriteHead(statusCode, statusMessage, headers);
    } as typeof res.writeHead;

    // Intercept end to emit log when response completes
    const originalEnd = res.end.bind(res);
    res.end = function (
      chunk?: unknown,
      encoding?: BufferEncoding | (() => void),
      callback?: () => void
    ): ServerResponse {
      // Emit log before ending
      emitLog();

      // Handle overloaded signatures
      if (typeof encoding === "function") {
        return originalEnd(chunk, encoding);
      }
      if (encoding !== undefined) {
        return originalEnd(chunk, encoding, callback);
      }
      return originalEnd(chunk, callback);
    } as typeof res.end;

    // Handle connection close without proper response
    res.on("close", () => {
      if (!logged) {
        // Connection closed before response completed
        builder.setError(499, {
          type: "ConnectionClosed",
          message: "Client closed connection",
        });
        emitLog();
      }
    });

    try {
      await handler(req, res, builder);
    } catch (error) {
      // Handle uncaught errors in the handler
      if (!logged) {
        const err = error instanceof Error ? error : new Error(String(error));
        builder.setError(500, {
          type: err.name,
          message: err.message,
        });
        emitLog();
      }

      // If response hasn't been sent, send error response
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    }
  };
}
