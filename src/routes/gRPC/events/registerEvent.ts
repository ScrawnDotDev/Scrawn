import {
  RegisterEventRequest,
  RegisterEventResponse,
} from "../../../gen/event/v1/event_pb.js";
import type { WideEventBuilder } from "../../../context/requestContext";
import { apiKeyContextKey } from "../../../context/auth";
import { wideEventContextKey } from "../../../context/requestContext";
import { registerEventSchema } from "../../../zod/event";
import { EventError } from "../../../errors/event";
import { createEventInstance, storeEvent } from "../../../utils/eventHelpers";
import { ZodError } from "zod";

export async function registerEvent(call: any, callback: any): Promise<void> {
  const req = call.request as RegisterEventRequest;
  const wideEventBuilder = call[wideEventContextKey] as WideEventBuilder | null;

  try {
    const apiKeyId = call[apiKeyContextKey] as string;
    const eventSkeleton = await registerEventSchema.parseAsync(req.toObject());

    wideEventBuilder?.setUser(eventSkeleton.userid);
    wideEventBuilder?.setEventContext({ eventType: eventSkeleton.type });

    // Create the appropriate event instance
    const event = createEventInstance(eventSkeleton);

    // Store the event
    await storeEvent(event, apiKeyId);

    const response = new RegisterEventResponse();
    response.setRandom("Event stored successfully");
    callback(null, response);
  } catch (error) {
    callback(error);
  }
}
