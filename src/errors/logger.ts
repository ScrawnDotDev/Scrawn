import pino, { type Logger as PinoLogger } from "pino";

interface LogContext {
  errorType?: string;
  location?: string;
  endpoint?: string;
  [key: string]: unknown;
}

interface OperationContext extends LogContext {
  operation: string;
  stage?: string;
  endpoint?: string;
  userId?: string | number;
  apiKeyId?: string | number;
  eventId?: string | number;
  requestId?: string;
}

class ErrorLogger {
  private logger: PinoLogger;
  private errorCounts = new Map<string, number>();
  private suppressedErrors = new Set<string>();
  private maxDuplicates = 3;

  constructor() {
    const isDev = process.env.NODE_ENV !== "production";

    this.logger = pino({
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
    });
  }

  private getErrorKey(errorType: string, message: string): string {
    return `${errorType}:${message}`;
  }

  private shouldLog(errorType: string, message: string): boolean {
    const key = this.getErrorKey(errorType, message);
    const count = this.errorCounts.get(key) || 0;

    if (count >= this.maxDuplicates) {
      this.suppressedErrors.add(key);
      return false;
    }

    this.errorCounts.set(key, count + 1);
    return true;
  }

  logError(
    errorType: string,
    message: string,
    originalError?: Error,
    context?: LogContext
  ): void {
    if (!this.shouldLog(errorType, message)) {
      return;
    }

    const logContext: Record<string, unknown> = {
      errorType,
      ...context,
    };

    if (originalError) {
      logContext.cause = originalError.message;
      logContext.location = this.extractLocation(originalError);
    }

    this.logger.error(logContext, message);
  }

  logWarning(message: string, context?: LogContext): void {
    this.logger.warn(context || {}, message);
  }

  logInfo(message: string, context?: LogContext): void {
    this.logger.info(context || {}, message);
  }

  logDebug(message: string, context?: LogContext): void {
    this.logger.debug(context || {}, message);
  }

  private extractLocation(error: Error): string {
    if (!error?.stack) return "unknown location";

    const lines = error.stack.split("\n");
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (line?.startsWith("at ")) {
        return line.replace("at ", "").split(" ")[0] || "unknown location";
      }
    }
    return "unknown location";
  }

  resetErrorCounts(): void {
    this.errorCounts.clear();
    this.suppressedErrors.clear();
  }

  getSuppressedErrorCount(): number {
    return this.suppressedErrors.size;
  }

  getSuppressedErrors(): string[] {
    return Array.from(this.suppressedErrors);
  }

  logOperationError(
    operation: string,
    stage: string,
    errorType: string,
    message: string,
    originalError?: Error,
    extra?: Omit<OperationContext, "operation" | "stage">
  ): void {
    this.logError(errorType, message, originalError, {
      operation,
      stage,
      ...extra,
    });
  }

  logOperationInfo(
    operation: string,
    stage: string,
    message: string,
    extra?: Omit<OperationContext, "operation" | "stage">
  ): void {
    this.logInfo(message, { operation, stage, ...extra });
  }

  logOperationDebug(
    operation: string,
    stage: string,
    message: string,
    extra?: Omit<OperationContext, "operation" | "stage">
  ): void {
    this.logDebug(message, { operation, stage, ...extra });
  }
}

export const logger = new ErrorLogger();
