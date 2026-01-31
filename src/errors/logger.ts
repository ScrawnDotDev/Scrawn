import pino, { type Logger as PinoLogger } from "pino";

/**
 * Wide Event interface for structured logging.
 * Each request emits exactly one wide event at completion containing all relevant context.
 * 
 * @see https://stripe.com/blog/canonical-log-lines
 * @see https://loggingsucks.com
 */
export interface WideEvent {
  // Request identification
  requestId: string;
  method: string;
  path: string;
  timestamp: string;

  // Environment context
  env: string;

  // Auth context (added during request processing)
  apiKeyId?: string | number;
  cacheHit?: boolean;

  // User/business context (added during request processing)
  userId?: string | number;
  eventType?: string;
  eventCount?: number;
  creditAmount?: number;
  debitAmount?: number;
  priceAmount?: number;

  // API key creation context
  apiKeyName?: string;
  apiKeyExpiration?: string;

  // Webhook context
  webhookEvent?: string;
  orderId?: string;

  // Outcome (added at request completion)
  statusCode?: number;
  outcome: "success" | "error";
  durationMs: number;

  // Error details (if applicable)
  error?: {
    type: string;
    message: string;
    cause?: string;
    stack?: string; // Included in development mode only
  };

  // Extensible for additional context
  [key: string]: unknown;
}

/**
 * Wide Event Logger following the canonical log lines pattern.
 * Emits one structured JSON event per request with all relevant context.
 * 
 * Uses only two log levels:
 * - info: successful requests
 * - error: failed requests
 */
class WideEventLogger {
  private pino: PinoLogger;

  constructor() {
    const isDev = process.env.NODE_ENV !== "production";

    this.pino = pino({
      level: process.env.LOG_LEVEL || "info",
      transport: isDev
        ? {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "SYS:standard",
              ignore: "pid,hostname",
              singleLine: false,
            },
          }
        : undefined,
      // In production, output raw JSON for log aggregation systems
      formatters: {
        level: (label) => ({ level: label }),
      },
    });
  }

  /**
   * Emit a wide event. Uses error level for failed requests, info for successful.
   */
  emit(event: WideEvent): void {
    // Remove undefined values for cleaner output
    const cleanEvent = Object.fromEntries(
      Object.entries(event).filter(([, value]) => value !== undefined)
    );

    if (event.outcome === "error") {
      this.pino.error(cleanEvent);
    } else {
      this.pino.info(cleanEvent);
    }
  }

  /**
   * Log server lifecycle events (startup, shutdown).
   * These are the only non-request logs allowed.
   */
  lifecycle(message: string, context?: Record<string, unknown>): void {
    this.pino.info({ ...context, lifecycle: true }, message);
  }

  /**
   * Log fatal errors that prevent the server from operating.
   */
  fatal(message: string, error?: Error): void {
    this.pino.fatal(
      {
        error: error
          ? {
              type: error.name,
              message: error.message,
              stack: error.stack,
            }
          : undefined,
      },
      message
    );
  }
}

export const logger = new WideEventLogger();
