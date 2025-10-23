import type { RegisterEventRequest } from "../../gen/event/v1/event_pb";
import { eventSchema } from "../../zod/event";
import { type EventType } from "../../interface/event";
import { ServerlessFunctionCallEvent } from "../../classes/event";

export function registerEvent(req: RegisterEventRequest) {
  console.log(req);
  try {
    let eventSkeleton = eventSchema.parse(req);
    let event: EventType;

    switch (eventSkeleton.type) {
      case "SERVERLESS_FUNCTION_CALL":
        event = new ServerlessFunctionCallEvent(
          eventSkeleton.userId,
          eventSkeleton.data,
        );
        break;
      default:
        throw new Error("Unsupported event type");
    }

    console.log(event.serialize());

    return { random: "Yello" };
  } catch (e) {
    console.error(e);
    throw new Error("Failed to register event");
  }
}
