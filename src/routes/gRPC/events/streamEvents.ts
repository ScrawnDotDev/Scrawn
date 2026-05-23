import type { ServerReadableStream, sendUnaryData } from "@grpc/grpc-js";
import * as Sentry from "@sentry/bun";
import {
  StreamEventRequest,
  StreamEventResponse,
  EventFailure,
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
    if (err.type === "PRICE_CALCULATION_FAILED") return "PRICE_CALCULATION_FAILED";
    return "STORAGE_FAILURE";
  }
  if (err instanceof EventError) {
    if (err.type === "UNSUPPORTED_EVENT_TYPE") return "UNSUPPORTED_EVENT_TYPE";
    return "VALIDATION_FAILED";
  }
  if (err && typeof err === "object" && (err as Error).name === "ZodError") {
    return "VALIDATION_FAILED";
  }
  return "INTERNAL_ERROR";
}

export async function streamEvents(
  call: ContextStreamCall,
  callback: sendUnaryData<StreamEventResponse>
): Promise<void> {
  let eventsProcessed = 0;
  const failures: EventFailure[] = [];

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
        Sentry.addBreadcrumb({
          category: "streamEvents",
          message: `Event processing failed: ${innerError instanceof Error ? innerError.message : String(innerError)}`,
          level: "error",
        });
        Sentry.captureException(innerError);

        const failure = EventFailure.create();
        failure.eventIndex = eventIndex;
        failure.idempotencyKey = req.idempotencyKey || "<unknown>";
        failure.errorCode = getFailureCode(innerError);
        failure.message = innerError instanceof Error ? innerError.message : String(innerError);
        failures.push(failure);
      }

      eventIndex++;
    }

    const response = StreamEventResponse.create();
    response.eventsProcessed = eventsProcessed;
    response.eventsFailed = failures.length;
    response.failures = failures;
    const total = eventsProcessed + failures.length;
    response.message = `Processed ${total} events (${eventsProcessed} succeeded, ${failures.length} failed)`;

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
