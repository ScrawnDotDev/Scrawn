import type {
  StreamEventRequest,
  StreamEventResponse,
} from "../../../gen/event/v1/event_pb";
import type { Event, EventKind } from "../../../interface/event/Event";
import { StreamEventResponseSchema } from "../../../gen/event/v1/event_pb";
import { create } from "@bufbuild/protobuf";
import { EventError } from "../../../errors/event";
import type { HandlerContext } from "@connectrpc/connect";
import { apiKeyContextKey } from "../../../context/auth";
import { logger } from "../../../errors/logger";
import {
  extractApiKeyFromContext,
  validateAndParseEvent,
  createEventInstance,
  storeEventsBatch,
} from "../../../utils/eventHelpers";

const OPERATION = "StreamEvents";

export async function streamEvents(
  requestStream: AsyncIterable<StreamEventRequest>,
  context: HandlerContext,
): Promise<StreamEventResponse> {
  let eventsProcessed = 0;
  const events: Array<Event<EventKind>> = [];

  try {
    // Extract API key ID from context
    const apiKeyId = extractApiKeyFromContext(context);

    logger.logOperationInfo(
      OPERATION,
      "authenticated",
      "Stream authenticated",
      {
        apiKeyId,
      },
    );

    // Collect all events from the stream
    for await (const req of requestStream) {
      try {
        // Validate and parse the incoming event
        const eventSkeleton = await validateAndParseEvent(req);

        // Create the appropriate event instance
        const event = createEventInstance(eventSkeleton);

        // Add to events array instead of storing immediately
        events.push(event);

        logger.logOperationInfo(
          OPERATION,
          "event_validated",
          "Event validated and queued",
          {
            apiKeyId,
            userId: eventSkeleton.userId,
            eventNumber: events.length,
          },
        );
      } catch (error) {
        // Log error but continue processing other events
        logger.logOperationError(
          OPERATION,
          "event_validation_failed",
          error instanceof EventError ? error.type : "UNKNOWN",
          "Failed to validate event in stream",
          error instanceof Error ? error : undefined,
          { apiKeyId, eventNumber: events.length + 1 },
        );

        // Continue collecting remaining events
      }
    }

    // Store all events in one batch after stream completes
    if (events.length > 0) {
      logger.logOperationInfo(
        OPERATION,
        "storing_batch",
        `Storing ${events.length} events in batch`,
        { apiKeyId, totalEvents: events.length },
      );

      try {
        await storeEventsBatch(events, apiKeyId);
        eventsProcessed = events.length;
      } catch (error) {
        logger.logOperationError(
          OPERATION,
          "batch_storage_failed",
          error instanceof EventError ? error.type : "UNKNOWN",
          "Failed to store events in batch",
          error instanceof Error ? error : undefined,
          { apiKeyId, totalEvents: events.length },
        );
      }
    }

    logger.logOperationInfo(
      OPERATION,
      "completed",
      "Stream processing completed",
      {
        apiKeyId: context.values.get(apiKeyContextKey),
        eventsProcessed,
      },
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
      },
    );

    // Re-throw EventError as-is
    if (error instanceof EventError) {
      throw error;
    }

    // Wrap unexpected errors
    throw EventError.unknown(error as Error);
  }
}
