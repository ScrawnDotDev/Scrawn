type LogLevel = "debug" | "info" | "warn" | "error";

interface LogConfig {
  level: LogLevel;
  isDevelopment: boolean;
  maxDuplicates: number;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class ErrorLogger {
  private static config: LogConfig = {
    level: "error",
    isDevelopment: process.env.NODE_ENV !== "production",
    maxDuplicates: 3,
  };

  private static errorCounts = new Map<string, number>();
  private static suppressedErrors = new Set<string>();

  static configure(config: Partial<LogConfig>): void {
    this.config = { ...this.config, ...config };
  }

  private static getErrorKey(prefix: string, message: string): string {
    return `${prefix}:${message}`;
  }

  private static shouldLog(prefix: string, message: string): boolean {
    const key = this.getErrorKey(prefix, message);
    const count = this.errorCounts.get(key) || 0;

    if (count >= this.config.maxDuplicates) {
      this.suppressedErrors.add(key);
      return false;
    }

    this.errorCounts.set(key, count + 1);
    return true;
  }

  private static extractLocation(error?: Error): string {
    if (!error?.stack) return "unknown location";

    const lines = error.stack.split("\n");
    // Find the first meaningful line after the error message
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (line?.startsWith("at ")) {
        const location =
          line.replace("at ", "").split(" ")[0] || "unknown location";
        return location;
      }
    }
    return "unknown location";
  }

  private static formatErrorDetails(
    errorType: string,
    message: string,
    originalError?: Error,
    details?: Record<string, unknown>,
  ): Record<string, unknown> {
    const output: Record<string, unknown> = {
      type: errorType,
      message,
    };

    if (originalError) {
      output.cause = originalError.message;
      output.location = this.extractLocation(originalError);
    }

    if (details && Object.keys(details).length > 0) {
      output.details = details;
    }

    return output;
  }

  static logError(
    prefix: string,
    errorType: string,
    message: string,
    originalError?: Error,
    details?: Record<string, unknown>,
  ): void {
    if (!this.shouldLog(prefix, message)) {
      return;
    }

    const output = this.formatErrorDetails(
      errorType,
      message,
      originalError,
      details,
    );

    console.error(`❌ [${prefix}]`, output);
  }

  static logWarning(
    prefix: string,
    message: string,
    details?: Record<string, unknown>,
  ): void {
    const output: Record<string, unknown> = {
      message,
    };

    if (details && Object.keys(details).length > 0) {
      output.details = details;
    }

    console.warn(`⚠️  [${prefix}]`, output);
  }

  static logDebug(prefix: string, message: string, data?: unknown): void {
    if (
      !this.config.isDevelopment ||
      LOG_LEVELS[this.config.level] > LOG_LEVELS.debug
    ) {
      return;
    }
    console.debug(`🔍 [${prefix}]`, message, data);
  }

  static logInfo(prefix: string, message: string, data?: unknown): void {
    if (LOG_LEVELS[this.config.level] > LOG_LEVELS.info) {
      return;
    }
    console.info(`ℹ️  [${prefix}]`, message, data);
  }

  static resetErrorCounts(): void {
    this.errorCounts.clear();
    this.suppressedErrors.clear();
  }

  static getSuppressedErrorCount(): number {
    return this.suppressedErrors.size;
  }

  static getSuppressedErrors(): string[] {
    return Array.from(this.suppressedErrors);
  }
}
