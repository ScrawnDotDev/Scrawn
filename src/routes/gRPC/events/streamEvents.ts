import {
  StreamEventRequest,
  StreamEventResponse,
} from "../../../gen/event/v1/event_pb.js";
import { EventError } from "../../../errors/event";
import type { WideEventBuilder } from "../../../context/requestContext";
import { wideEventContextKey } from "../../../context/requestContext";
import { streamEventSchema } from "../../../zod/event";
import { createEventInstance, storeEvent } from "../../../utils/eventHelpers";
import { apiKeyContextKey } from "../../../context/auth";

export async function streamEvents(call: any, callback: any): Promise<void> {
  let eventsProcessed = 0;
  let userId: string | undefined;
  const wideEventBuilder = call[wideEventContextKey] as WideEventBuilder | null;
  const apiKeyId = call[apiKeyContextKey] as string;

  try {
    for await (const req of call) {
      try {
        const eventSkeleton = await streamEventSchema.parseAsync(
          req.toObject()
        );

        if (!userId && eventSkeleton.userid) {
          userId = eventSkeleton.userid;
          wideEventBuilder?.setUser(userId);
          wideEventBuilder?.setEventContext({ eventType: "AI_TOKEN_USAGE" });
        }

        const event = createEventInstance(eventSkeleton);

        if (event.type !== "AI_TOKEN_USAGE") {
          throw EventError.unsupportedEventType(event.type);
        }

        await storeEvent(event, apiKeyId);
        eventsProcessed++;
      } catch (innerError) {
        console.log(innerError);
        callback(innerError, null);
        return;
      }
    }

    const response = new StreamEventResponse();
    response.setEventsprocessed(eventsProcessed);
    response.setMessage(`Successfully processed ${eventsProcessed} events`);

    callback(null, response);
  } catch (error) {
    callback(error, null);
  } finally {
    wideEventBuilder?.setEventContext({ eventCount: eventsProcessed });
  }
}
