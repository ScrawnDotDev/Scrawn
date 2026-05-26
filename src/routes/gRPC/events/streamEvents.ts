import type { ServerReadableStream, sendUnaryData } from "@grpc/grpc-js";
import * as Sentry from "@sentry/bun";
import { ZodError } from "zod";
import {
  StreamEventRequest,
  StreamEventResponse,
} from "../../../gen/event/v1/event";
import { EventError } from "../../../errors/event";
import { AuthError } from "../../../errors/auth";
import { StorageError } from "../../../errors/storage";
import { streamEventSchema } from "../../../zod/event";
import { createEventInstance, storeEvent } from "../../../utils/eventHelpers";
import { apiKeyContextKey } from "../../../context/auth";
import { wideEventContextKey } from "../../../context/requestContext";
import type { ContextStreamCall } from "../../../interface/types/context";

function getFailureCode(err: unknown): string {
  if (err instanceof StorageError) {
    if (err.type === "CONSTRAINT_VIOLATION") return "DUPLICATE_IDEMPOTENCY_KEY";
    if (err.type === "INVALID_DATA") return "INVALID_DATA";
    if (err.type === "INVALID_TIMESTAMP") return "INVALID_TIMESTAMP";
    if (err.type === "PRICE_CALCULATION_FAILED")
      return "PRICE_CALCULATION_FAILED";
    return "STORAGE_FAILURE";
  }
  if (err instanceof EventError) {
    if (err.type === "UNSUPPORTED_EVENT_TYPE") return "UNSUPPORTED_EVENT_TYPE";
    return "VALIDATION_FAILED";
  }
  if (err instanceof ZodError) {
    return "VALIDATION_FAILED";
  }
  return "INTERNAL_ERROR";
}

function publicMessageForCode(code: string): string {
  switch (code) {
    case "DUPLICATE_IDEMPOTENCY_KEY":
      return "Duplicate idempotency key";
    case "VALIDATION_FAILED":
      return "Event validation failed";
    case "INVALID_DATA":
      return "Invalid event data";
    case "INVALID_TIMESTAMP":
      return "Invalid event timestamp";
    case "PRICE_CALCULATION_FAILED":
      return "Price calculation failed";
    case "UNSUPPORTED_EVENT_TYPE":
      return "Unsupported event type";
    case "STORAGE_FAILURE":
      return "Storage error";
    default:
      return "Internal server error";
  }
}

export async function streamEvents(
  call: ContextStreamCall,
  callback: sendUnaryData<StreamEventResponse>
): Promise<void> {
  let eventsProcessed = 0;
  const failures: Array<{
    eventIndex: number;
    idempotencyKey: string;
    errorCode: string;
    message: string;
  }> = [];

  const wideEventBuilder = call[wideEventContextKey];
  const auth = call[apiKeyContextKey];

  try {
    if (!auth) {
      return callback?.(
        AuthError.invalidAPIKey("API key context not found"),
        null
      );
    }

    if (auth.role === "dashboard") {
      return callback?.(
        AuthError.permissionDenied("Dashboard keys cannot ingest events"),
        null
      );
    }

    let eventIndex = 0;

    for await (const req of call) {
      try {
        const eventSkeleton = await streamEventSchema.parseAsync({ ...req });

        wideEventBuilder?.setUser(eventSkeleton.userId);
        wideEventBuilder?.setEventContext({ eventType: "AI_TOKEN_USAGE" });

        const event = createEventInstance(eventSkeleton);

        if (event.type !== "AI_TOKEN_USAGE") {
          throw EventError.unsupportedEventType(event.type);
        }

        await storeEvent(event, auth);
        eventsProcessed++;
      } catch (innerError) {
        const errorCode = getFailureCode(innerError);

        Sentry.addBreadcrumb({
          category: "streamEvents",
          message: `Event [${eventIndex}] processing failed: ${innerError instanceof Error ? innerError.message : String(innerError)}`,
          data: {
            eventIndex,
            idempotencyKey: req.idempotencyKey || "<unknown>",
          },
          level: "error",
        });
        Sentry.captureException(innerError, {
          extra: {
            eventIndex,
            idempotencyKey: req.idempotencyKey || "<unknown>",
            errorCode,
          },
        });

        failures.push({
          eventIndex,
          idempotencyKey: req.idempotencyKey || "<unknown>",
          errorCode,
          message: publicMessageForCode(errorCode),
        });
      }

      eventIndex++;
    }

    const total = eventsProcessed + failures.length;
    const response: StreamEventResponse = {
      eventsProcessed,
      message: `Processed ${total} events (${eventsProcessed} succeeded, ${failures.length} failed)`,
    };

    wideEventBuilder?.setEventContext({
      eventType: "AI_TOKEN_USAGE",
      eventCount: eventsProcessed,
    });
    if (failures.length > 0) {
      wideEventBuilder?.addContext({
        eventsFailed: failures.length,
        eventFailures: failures.map((f) => ({
          eventIndex: f.eventIndex,
          errorCode: f.errorCode,
          idempotencyKey: f.idempotencyKey,
        })),
      });
    }

    callback(null, response);
  } catch (error) {
    callback(error as Error, null);
  } finally {
    wideEventBuilder?.setEventContext({ eventCount: eventsProcessed });
  }
}
