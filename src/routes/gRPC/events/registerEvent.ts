import type {
  RegisterEventRequest,
  RegisterEventResponse,
} from "../../../gen/event/v1/event_pb";
import { RegisterEventResponseSchema } from "../../../gen/event/v1/event_pb";
import { create } from "@bufbuild/protobuf";
import { EventError } from "../../../errors/event";
import type { HandlerContext } from "@connectrpc/connect";
import { apiKeyContextKey } from "../../../context/auth";
import { logger } from "../../../errors/logger";
import {
  extractApiKeyFromContext,
  validateAndParseEvent,
  createEventInstance,
  storeEvent,
} from "../../../utils/eventHelpers";

const OPERATION = "RegisterEvent";

export async function registerEvent(
  req: RegisterEventRequest,
  context: HandlerContext,
): Promise<RegisterEventResponse> {
  try {
    // Extract API key ID from context
    const apiKeyId = extractApiKeyFromContext(context);

    logger.logOperationInfo(
      OPERATION,
      "authenticated",
      "Request authenticated",
      {
        apiKeyId,
      },
    );

    // Validate and parse the incoming event
    const eventSkeleton = await validateAndParseEvent(req);

    // Create the appropriate event instance
    const event = createEventInstance(eventSkeleton);

    // Store the event
    await storeEvent(event, apiKeyId);

    logger.logOperationInfo(
      OPERATION,
      "completed",
      "Event stored successfully",
      {
        apiKeyId,
        userId: eventSkeleton.userId,
      },
    );

    return create(RegisterEventResponseSchema, {
      random: "Event stored successfully",
    });
  } catch (error) {
    logger.logOperationError(
      OPERATION,
      "failed",
      error instanceof EventError ? error.type : "UNKNOWN",
      "RegisterEvent handler failed",
      error instanceof Error ? error : undefined,
      { apiKeyId: context.values.get(apiKeyContextKey) },
    );

    // Re-throw EventError as-is
    if (error instanceof EventError) {
      throw error;
    }

    // Wrap unexpected errors
    throw EventError.unknown(error as Error);
  }
}
