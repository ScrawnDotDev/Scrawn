import type {
  RegisterEventRequest,
  RegisterEventResponse,
} from "../../../gen/event/v1/event_pb";
import { RegisterEventResponseSchema } from "../../../gen/event/v1/event_pb";
import { create } from "@bufbuild/protobuf";
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

  // Add business context to wide event
  wideEventBuilder?.setUser(eventSkeleton.userId);
  wideEventBuilder?.setEventContext({ eventType: eventSkeleton.type });

  // Create the appropriate event instance
  const event = createEventInstance(eventSkeleton);

  // Store the event
  await storeEvent(event, apiKeyId);

  return create(RegisterEventResponseSchema, {
    random: "Event stored successfully",
  });
}
