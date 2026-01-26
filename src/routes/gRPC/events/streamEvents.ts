import type {
  StreamEventRequest,
  StreamEventResponse,
} from "../../../gen/event/v1/event_pb";

import { StreamEventResponseSchema } from "../../../gen/event/v1/event_pb";
import { create } from "@bufbuild/protobuf";
import { EventError } from "../../../errors/event";
import type { HandlerContext } from "@connectrpc/connect";
import { apiKeyContextKey } from "../../../context/auth";
import { logger } from "../../../errors/logger";
import {
  extractApiKeyFromContext,
  validateAndParseStreamEvent,
  createEventInstance,
  storeEvent,
} from "../../../utils/eventHelpers";

const OPERATION = "StreamEvents";

export async function streamEvents(
  requestStream: AsyncIterable<StreamEventRequest>,
  context: HandlerContext
): Promise<StreamEventResponse> {
  let eventsProcessed = 0;

  try {
    // Extract API key ID from context
    const apiKeyId = extractApiKeyFromContext(context);

    logger.logOperationInfo(
      OPERATION,
      "authenticated",
      "Stream authenticated",
      {
        apiKeyId,
      }
    );

    // Collect all events from the stream
    for await (const req of requestStream) {
      // Validate and parse the incoming event
      const eventSkeleton = await validateAndParseStreamEvent(req);

      // Create the appropriate event instance
      const event = createEventInstance(eventSkeleton);

      if (event.type !== "AI_TOKEN_USAGE") {
        throw EventError.unsupportedEventType(event.type);
      }

      await storeEvent(event, apiKeyId);
      eventsProcessed += 1;

      logger.logOperationInfo(
        OPERATION,
        "event_processed",
        "Event processed and stored",
        {
          apiKeyId,
          userId: eventSkeleton.userId,
          eventNumber: eventsProcessed,
        }
      );
    }

    logger.logOperationInfo(
      OPERATION,
      "completed",
      "Stream processing completed",
      {
        apiKeyId: context.values.get(apiKeyContextKey),
        eventsProcessed,
      }
    );

    return create(StreamEventResponseSchema, {
      eventsProcessed,
      message: `Successfully processed ${eventsProcessed} events`,
    });
  } catch (error) {
    logger.logOperationError(
      OPERATION,
      "failed",
      error instanceof EventError ? error.type : "UNKNOWN",
      "StreamEvents handler failed",
      error instanceof Error ? error : undefined,
      {
        apiKeyId: context.values.get(apiKeyContextKey),
        eventsProcessed,
      }
    );

    // Re-throw EventError as-is
    if (error instanceof EventError) {
      throw error;
    }

    // Wrap unexpected errors
    throw EventError.unknown(error as Error);
  }
}
