import type { HandlerContext } from "@connectrpc/connect";
import { apiKeyContextKey } from "../context/auth";
import { AuthError } from "../errors/auth";
import { EventError } from "../errors/event";
import {
  registerEventSchema,
  streamEventSchema,
  type RegisterEventSchemaType,
  type StreamEventSchemaType,
} from "../zod/event";
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
      // Check if the ZodError is wrapping our custom error by looking at the cause
      const firstIssue = error.issues[0];
      if (firstIssue && firstIssue.message.startsWith("Event validation failed:")) {
        // The Zod transform threw an EventError which was caught
        // Extract just the meaningful part after "Event validation failed:"
        const cleanMessage = firstIssue.message.replace(/^Event validation failed:\s*/, '');
        throw EventError.validationFailed(cleanMessage);
      }
      
      const issues = error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      throw EventError.validationFailed(issues, error);
    }
    throw EventError.validationFailed(
      `Schema validation error: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
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
      // Check if the ZodError is wrapping our custom error by looking at the cause
      const firstIssue = error.issues[0];
      if (firstIssue && firstIssue.message.startsWith("Event validation failed:")) {
        // The Zod transform threw an EventError which was caught
        // Extract just the meaningful part after "Event validation failed:"
        const cleanMessage = firstIssue.message.replace(/^Event validation failed:\s*/, '');
        throw EventError.validationFailed(cleanMessage);
      }
      
      const issues = error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      throw EventError.validationFailed(issues, error);
    }
    throw EventError.validationFailed(
      `Schema validation error: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Create the appropriate event instance based on the event skeleton
 */

export function createEventInstance(
  eventSkeleton: RegisterEventSchemaType | StreamEventSchemaType
): Event {
  try {
    switch (eventSkeleton.type) {
      case "SDK_CALL":
        return new SDKCall(eventSkeleton.userId, eventSkeleton.data);
      case "AI_TOKEN_USAGE":
        return new AITokenUsage(eventSkeleton.userId, eventSkeleton.data);
      default:
        throw EventError.unsupportedEventType(
          "EXHAUSTIVE_CHECK_EVENT_INSTANCE"
        );
    }
  } catch (error) {
    if (error instanceof EventError) {
      throw error;
    }
    throw EventError.unknown(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Store the event using the appropriate storage adapter
 */
export async function storeEvent(
  event: Event,
  apiKeyId: string
): Promise<void> {
  try {
    const adapter = await StorageAdapterFactory.getStorageAdapter(
      event,
      apiKeyId
    );
    await adapter.add(event.serialize());
  } catch (error) {
    throw EventError.serializationError(
      error instanceof Error ? `Failed to store event: ${error.message}` : `Failed to store event: ${String(error)}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Store multiple events in a batch - groups by type and uses batch operations when possible
 */
