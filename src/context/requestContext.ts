import { createContextKey } from "@connectrpc/connect";
import { randomUUID } from "node:crypto";
import type { WideEvent } from "../errors/logger";

/**
 * Context key for accessing the WideEventBuilder during request processing.
 */
export const wideEventContextKey = createContextKey<WideEventBuilder | null>(
  null
);

/**
 * Generate a unique request ID using UUID v4.
 */
export function generateRequestId(): string {
  return randomUUID();
}

/**
 * Extract the service method path from a full URL.
 * Converts "https://example.com/event.v1.EventService/RegisterEvent" to "/event.v1.EventService/RegisterEvent"
 */
function extractPath(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname;
  } catch {
    // If URL parsing fails, try to extract path manually
    const pathMatch = url.match(/(?:https?:\/\/[^/]+)?(\/.+)/);
    return pathMatch?.[1] || url;
  }
}

/**
 * Builder class for constructing wide events during request processing.
 * Each request gets one builder instance that accumulates context throughout
 * the request lifecycle, then emits a single wide event at completion.
 */
export class WideEventBuilder {
  private event: Partial<WideEvent>;
  private startTime: number;

  constructor(requestId: string, method: string, url: string) {
    this.startTime = Date.now();
    this.event = {
      requestId,
      method,
      path: extractPath(url),
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || "development",
    };
  }

  /**
   * Set authentication context after successful auth.
   */
  setAuth(apiKeyId: string | number, cacheHit: boolean): this {
    this.event.apiKeyId = apiKeyId;
    this.event.cacheHit = cacheHit;
    return this;
  }

  /**
   * Set user context.
   */
  setUser(userId: string | number): this {
    this.event.userId = userId;
    return this;
  }

  /**
   * Set event processing context.
   */
  setEventContext(data: {
    eventType?: string;
    eventCount?: number;
  }): this {
    if (data.eventType !== undefined) this.event.eventType = data.eventType;
    if (data.eventCount !== undefined) this.event.eventCount = data.eventCount;
    return this;
  }

  /**
   * Set payment/pricing context.
   */
  setPaymentContext(data: {
    creditAmount?: number;
    debitAmount?: number;
    priceAmount?: number;
  }): this {
    if (data.creditAmount !== undefined)
      this.event.creditAmount = data.creditAmount;
    if (data.debitAmount !== undefined)
      this.event.debitAmount = data.debitAmount;
    if (data.priceAmount !== undefined)
      this.event.priceAmount = data.priceAmount;
    return this;
  }

  /**
   * Set API key creation context.
   */
  setApiKeyContext(data: { name?: string; expiration?: string }): this {
    if (data.name !== undefined) this.event.apiKeyName = data.name;
    if (data.expiration !== undefined)
      this.event.apiKeyExpiration = data.expiration;
    return this;
  }

  /**
   * Set webhook processing context.
   */
  setWebhookContext(data: { webhookEvent?: string; orderId?: string }): this {
    if (data.webhookEvent !== undefined)
      this.event.webhookEvent = data.webhookEvent;
    if (data.orderId !== undefined) this.event.orderId = data.orderId;
    return this;
  }

  /**
   * Add arbitrary business context.
   */
  addContext(data: Record<string, unknown>): this {
    Object.assign(this.event, data);
    return this;
  }

  /**
   * Set the request outcome on success.
   */
  setSuccess(statusCode: number = 200): this {
    this.event.outcome = "success";
    this.event.statusCode = statusCode;
    return this;
  }

  /**
   * Set the request outcome on error.
   */
  setError(
    statusCode: number,
    error: { type: string; message: string; cause?: string }
  ): this {
    this.event.outcome = "error";
    this.event.statusCode = statusCode;
    this.event.error = error;
    return this;
  }

  /**
   * Build the final wide event with duration calculation.
   */
  build(): WideEvent {
    const durationMs = Date.now() - this.startTime;

    return {
      ...this.event,
      outcome: this.event.outcome || "success",
      durationMs,
    } as WideEvent;
  }
}

/**
 * Factory function to create a new WideEventBuilder for a request.
 */
export function createWideEventBuilder(
  requestId: string,
  method: string,
  url: string
): WideEventBuilder {
  return new WideEventBuilder(requestId, method, url);
}
