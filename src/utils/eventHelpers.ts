import type { HandlerContext } from "@connectrpc/connect";
import { apiKeyContextKey } from "../context/auth";
import { AuthError } from "../errors/auth";
import { EventError } from "../errors/event";
import { eventSchema } from "../zod/event";
import { ZodError } from "zod";
import type { EventType } from "../interface/event/Event";
import { SDKCall } from "../events/RawEvents/SDKCall";
import { AITokenUsage } from "../events/AIEvents/AITokenUsage";
import { StorageAdapterFactory } from "../factory";
import { handleAddAiTokenUsage } from "../storage/adapter/postgres/handlers";
import { StorageError } from "../errors/storage";
import type {
  RegisterEventRequest,
  StreamEventRequest,
} from "../gen/event/v1/event_pb";

/**
 * Extract API key ID from the request context
 */
export function extractApiKeyFromContext(context: HandlerContext): string {
  const apiKeyId = context.values.get(apiKeyContextKey);
  if (!apiKeyId) {
    throw AuthError.invalidAPIKey("API key ID not found in context");
  }
  return apiKeyId;
}

/**
 * Validate and parse the incoming event request
 */
export async function validateAndParseEvent(
  req: RegisterEventRequest | StreamEventRequest,
) {
  try {
    return await eventSchema.parseAsync(req);
  } catch (error) {
    if (error instanceof EventError) {
      throw error;
    }
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
}

/**
 * Create the appropriate event instance based on the event skeleton
 */
export function createEventInstance(eventSkeleton: {
  type: string;
  userId: string;
  data: any;
}): EventType {
  try {
    switch (eventSkeleton.type) {
      case "SDK_CALL":
        return new SDKCall(eventSkeleton.userId, eventSkeleton.data);
      case "AI_TOKEN_USAGE":
        return new AITokenUsage(eventSkeleton.userId, eventSkeleton.data);
      default:
        throw EventError.unsupportedEventType(eventSkeleton.type);
    }
  } catch (error) {
    if (error instanceof EventError) {
      throw error;
    }
    throw EventError.unknown(error as Error);
  }
}

/**
 * Store the event using the appropriate storage adapter
 */
export async function storeEvent(
  event: EventType,
  apiKeyId: string,
): Promise<void> {
  try {
    const adapter = await StorageAdapterFactory.getStorageAdapter(
      event,
      apiKeyId,
    );
    await adapter.add(event.serialize());
  } catch (error) {
    throw EventError.serializationError(
      "Failed to store event",
      error as Error,
    );
  }
}

/**
 * Store multiple events in a batch - groups by type and uses batch operations when possible
 */
export async function storeEventsBatch(
  events: EventType[],
  apiKeyId: string,
): Promise<void> {
  if (events.length === 0) {
    return;
  }

  // Group events by type
  const eventsByType = new Map<string, EventType[]>();
  for (const event of events) {
    const type = event.type;
    if (!eventsByType.has(type)) {
      eventsByType.set(type, []);
    }
    eventsByType.get(type)!.push(event);
  }

  // Process each type
  for (const [type, typeEvents] of eventsByType) {
    try {
      if (type === "AI_TOKEN_USAGE") {
        // Batch process AI_TOKEN_USAGE events
        const serializedEvents: Array<
          import("../interface/event/Event").BaseEventMetadata<"AI_TOKEN_USAGE"> & {
            userId: string;
          }
        > = [];

        for (const event of typeEvents) {
          const { SQL } = event.serialize();
          if (!SQL) {
            throw StorageError.serializationFailed(
              "Event serialization returned null or undefined",
            );
          }
          if (SQL.type !== "AI_TOKEN_USAGE") {
            throw StorageError.serializationFailed(
              `Expected AI_TOKEN_USAGE but got ${SQL.type}`,
            );
          }
          serializedEvents.push(SQL as any);
        }

        await handleAddAiTokenUsage(serializedEvents, apiKeyId);
      } else {
        // For other event types, use individual storage
        for (const event of typeEvents) {
          await storeEvent(event, apiKeyId);
        }
      }
    } catch (error) {
      throw EventError.serializationError(
        `Failed to store ${type} events`,
        error as Error,
      );
    }
  }
}
