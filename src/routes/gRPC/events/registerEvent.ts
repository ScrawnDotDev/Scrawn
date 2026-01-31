import type {
  RegisterEventRequest,
  RegisterEventResponse,
} from "../../../gen/event/v1/event_pb";
import { RegisterEventResponseSchema } from "../../../gen/event/v1/event_pb";
import { create } from "@bufbuild/protobuf";
import { EventError } from "../../../errors/event";
import type { HandlerContext } from "@connectrpc/connect";
import { apiKeyContextKey } from "../../../context/auth";
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
  try {
    // Extract API key ID from context
    const apiKeyId = extractApiKeyFromContext(context);

    // Validate and parse the incoming event
    const eventSkeleton = await validateAndParseRegisterEvent(req);

    // Create the appropriate event instance
    const event = createEventInstance(eventSkeleton);

    // Store the event
    await storeEvent(event, apiKeyId);

    return create(RegisterEventResponseSchema, {
      random: "Event stored successfully",
    });
  } catch (error) {
    // Re-throw EventError as-is
    if (error instanceof EventError) {
      throw error;
    }

    // Wrap unexpected errors
    throw EventError.unknown(error as Error);
  }
}
