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

  const wideEventBuilder = context.values.get(wideEventContextKey);

  // Extract API key ID from context
  const apiKeyId = extractApiKeyFromContext(context);

  try {
    for await (const req of requestStream) {
      const eventSkeleton = await validateAndParseStreamEvent(req);

      // Capture userId from first event for logging
      if (!userId) {
        userId = eventSkeleton.userId;
        wideEventBuilder?.setUser(userId);
        wideEventBuilder?.setEventContext({ eventType: "AI_TOKEN_USAGE" });
      }

      const event = createEventInstance(eventSkeleton);

      if (event.type !== "AI_TOKEN_USAGE") {
        throw EventError.unsupportedEventType(event.type);
      }

      await storeEvent(event, apiKeyId);
      eventsProcessed += 1;
    }

    return create(StreamEventResponseSchema, {
      eventsProcessed,
      message: `Successfully processed ${eventsProcessed} events`,
    });
  } finally {
    // Always update the count, even on error
    wideEventBuilder?.setEventContext({ eventCount: eventsProcessed });
  }
}
