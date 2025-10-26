import type { RegisterEventRequest } from "../../gen/event/v1/event_pb";
import { eventSchema } from "../../zod/event";
import { type EventType } from "../../interface/event/Event";
import { ServerlessFunctionCallEvent } from "../../classes/event";
import { EventError } from "../../errors/event";
import { ZodError } from "zod";
import { StorageAdapterFactory } from "../../factory";

export function registerEvent(req: RegisterEventRequest) {
  try {
    // Validate the incoming request against the schema
    let eventSkeleton;
    try {
      eventSkeleton = eventSchema.parse(req);
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ");
        throw EventError.validationFailed(issues, error);
      }
      throw EventError.validationFailed(
        "Unknown validation error",
        error as Error,
      );
    }

    // Create the appropriate event based on type
    let event: EventType;

    try {
      switch (eventSkeleton.type) {
        case "SERVERLESS_FUNCTION_CALL":
          event = new ServerlessFunctionCallEvent(
            eventSkeleton.userId,
            eventSkeleton.data,
          );
          break;
        default:
          throw EventError.unsupportedEventType(eventSkeleton.type);
      }
    } catch (error) {
      if (error instanceof EventError) {
        throw error;
      }
      throw EventError.unknown(error as Error);
    }

    // Serialize the event
    let serializedEvent: string;
    try {
      StorageAdapterFactory.getStorageAdapter(event).consume();
      // console.log("Event serialized successfully:", serializedEvent);
    } catch (error) {
      throw EventError.serializationError(
        "Failed to serialize event data",
        error as Error,
      );
    }

    return { random: "Yello" };
  } catch (error) {
    console.error("=== RegisterEvent Error ===");
    console.error("Error:", error);

    // Re-throw EventError as-is
    if (error instanceof EventError) {
      throw error;
    }

    // Wrap unexpected errors
    throw EventError.unknown(error as Error);
  }
}
