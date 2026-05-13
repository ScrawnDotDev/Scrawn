import type { ServerReadableStream, sendUnaryData } from "@grpc/grpc-js";
import * as Sentry from "@sentry/bun";
import {
  StreamEventRequest,
  StreamEventResponse,
} from "../../../gen/event/v1/event_pb.js";
import { EventError } from "../../../errors/event";
import { AuthError } from "../../../errors/auth";
import { streamEventSchema } from "../../../zod/event";
import { createEventInstance, storeEvent } from "../../../utils/eventHelpers";
import { apiKeyContextKey } from "../../../context/auth";
import { wideEventContextKey } from "../../../context/requestContext";
import type { ContextStreamCall } from "../../../interface/types/context";

export async function streamEvents(
  call: ContextStreamCall,
  callback: sendUnaryData<StreamEventResponse>
): Promise<void> {
  let eventsProcessed = 0;

  const wideEventBuilder = call[wideEventContextKey];
  const auth = call[apiKeyContextKey];

  try {
    if (!auth) {
      return callback?.(AuthError.invalidAPIKey("API key context not found"), null);
    }

    if (auth.role === "dashboard") {
      return callback?.(
        AuthError.permissionDenied("Dashboard keys cannot ingest events"),
        null
      );
    }

    for await (const req of call) {
      try {
        const eventSkeleton = await streamEventSchema.parseAsync(
          req.toObject()
        );

        wideEventBuilder?.setUser(eventSkeleton.userid);
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
        callback(innerError as Error, null);
        return;
      }
    }

    const response = new StreamEventResponse();
    response.setEventsprocessed(eventsProcessed);
    response.setMessage(`Successfully processed ${eventsProcessed} events`);

    callback(null, response);
  } catch (error) {
    callback(error as Error, null);
  } finally {
    wideEventBuilder?.setEventContext({ eventCount: eventsProcessed });
  }
}
