import type { HandlerContext } from "@connectrpc/connect";
import { apiKeyContextKey } from "../context/auth";
import { AuthError } from "../errors/auth";
import { EventError } from "../errors/event";
import { registerEventSchema, streamEventSchema } from "../zod/event";
import { ZodError } from "zod";
import type { Event } from "../interface/event/Event";
import { SDKCall } from "../events/RawEvents/SDKCall";
import { AITokenUsage } from "../events/AIEvents/AITokenUsage";
import { RequestAITokenUsage } from "../events/RequestEvents/RequestAITokenUsage";
import { StorageAdapterFactory } from "../factory";
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
export async function validateAndParseRegisterEvent(req: RegisterEventRequest) {
  try {
    return await registerEventSchema.parseAsync(req);
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

export async function validateAndParseStreamEvent(req: StreamEventRequest) {
  try {
    return await streamEventSchema.parseAsync(req);
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
}): Event {
  try {
    switch (eventSkeleton.type) {
      case "SDK_CALL":
        return new SDKCall(eventSkeleton.userId, eventSkeleton.data);
      case "AI_TOKEN_USAGE":
        return new AITokenUsage(eventSkeleton.userId, eventSkeleton.data);
      case "REQUEST_AI_TOKEN_USAGE":
        return new RequestAITokenUsage(
          eventSkeleton.userId,
          eventSkeleton.data,
        );
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
  event: Event,
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
