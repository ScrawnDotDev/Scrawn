import {
  RegisterEventRequest,
  RegisterEventResponse,
} from "../../../gen/event/v1/event_pb";
import type { HandlerContext } from "@connectrpc/connect";
import { wideEventContextKey } from "../../../context/requestContext";
import {
  extractApiKeyFromContext,
  validateAndParseRegisterEvent,
  createEventInstance,
  storeEvent,
} from "../../../utils/eventHelpers";

export async function registerEvent(
  req: RegisterEventRequest,
  context: HandlerContext
): Promise<RegisterEventResponse> {
  const wideEventBuilder = context.values.get(wideEventContextKey);

  // Extract API key ID from context
  const apiKeyId = extractApiKeyFromContext(context);

  // Validate and parse the incoming event
  const eventSkeleton = await validateAndParseRegisterEvent(req);

  console.log(eventSkeleton);
  // Add business context to wide event
  wideEventBuilder?.setUser(eventSkeleton.userId);
  wideEventBuilder?.setEventContext({ eventType: eventSkeleton.type });

  // Create the appropriate event instance
  const event = createEventInstance(eventSkeleton);

  // Store the event
  await storeEvent(event, apiKeyId);

  return new RegisterEventResponse({
    random: "Event stored successfully",
  });
}
