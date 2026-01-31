import type {
  StreamEventRequest,
  StreamEventResponse,
} from "../../../gen/event/v1/event_pb";

import { StreamEventResponseSchema } from "../../../gen/event/v1/event_pb";
import { create } from "@bufbuild/protobuf";
import { EventError } from "../../../errors/event";
import type { HandlerContext } from "@connectrpc/connect";
import { wideEventContextKey } from "../../../context/requestContext";
import {
  extractApiKeyFromContext,
  validateAndParseStreamEvent,
  createEventInstance,
  storeEvent,
} from "../../../utils/eventHelpers";

export async function streamEvents(
  requestStream: AsyncIterable<StreamEventRequest>,
  context: HandlerContext
): Promise<StreamEventResponse> {
  let eventsProcessed = 0;
  let userId: string | undefined;

  // Get the wide event builder for adding business context
  const wideEventBuilder = context.values.get(wideEventContextKey);

  try {
    // Extract API key ID from context
    const apiKeyId = extractApiKeyFromContext(context);

    // Collect all events from the stream
    for await (const req of requestStream) {
      // Validate and parse the incoming event
      const eventSkeleton = await validateAndParseStreamEvent(req);

      // Capture userId from first event for logging
      if (!userId) {
        userId = eventSkeleton.userId;
        wideEventBuilder?.setUser(userId);
        wideEventBuilder?.setEventContext({ eventType: "AI_TOKEN_USAGE" });
      }

      // Create the appropriate event instance
      const event = createEventInstance(eventSkeleton);

      if (event.type !== "AI_TOKEN_USAGE") {
        throw EventError.unsupportedEventType(event.type);
      }

      await storeEvent(event, apiKeyId);
      eventsProcessed += 1;
    }

    // Update wide event with final count
    wideEventBuilder?.setEventContext({ eventCount: eventsProcessed });

    return create(StreamEventResponseSchema, {
      eventsProcessed,
      message: `Successfully processed ${eventsProcessed} events`,
    });
  } catch (error) {
    // Update wide event with count even on error
    wideEventBuilder?.setEventContext({ eventCount: eventsProcessed });

    // Re-throw EventError as-is
    if (error instanceof EventError) {
      throw error;
    }

    // Wrap unexpected errors
    throw EventError.unknown(error instanceof Error ? error : new Error(String(error)));
  }
}
