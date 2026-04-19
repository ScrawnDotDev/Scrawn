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
 * Validate and parse the incoming register event request.
 * Handles Zod validation errors and extracts clean error messages.
 */
export async function validateAndParseRegisterEvent(
  req: RegisterEventRequest
): Promise<RegisterEventSchemaType> {
  try {
    return await registerEventSchema.parseAsync(req);
  } catch (error) {
    throw convertValidationError(error);
  }
}

/**
 * Validate and parse the incoming stream event request.
 */
export async function validateAndParseStreamEvent(
  req: StreamEventRequest
): Promise<StreamEventSchemaType> {
  try {
    return await streamEventSchema.parseAsync(req);
  } catch (error) {
    throw convertValidationError(error);
  }
}

/**
 * Convert Zod validation errors to EventError.
 * Detects wrapped EventErrors from Zod transforms and extracts clean messages.
 */
function convertValidationError(error: unknown): EventError {
  if (error instanceof EventError) {
    return error;
  }

  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];

    // Check if Zod wrapped our custom EventError from a transform
    if (firstIssue?.message.startsWith("Event validation failed:")) {
      const cleanMessage = firstIssue.message.replace(
        /^Event validation failed:\s*/,
        ""
      );
      return EventError.validationFailed(cleanMessage);
    }

    const issues = error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    return EventError.validationFailed(issues);
  }

  return EventError.validationFailed(
    error instanceof Error ? error.message : String(error)
  );
}

/**
 * Create the appropriate event instance based on the event skeleton
 */
export function createEventInstance(
  eventSkeleton: RegisterEventSchemaType | StreamEventSchemaType
): Event {
  switch (eventSkeleton.type) {
    case "SDK_CALL":
      return new SDKCall(eventSkeleton.userId, eventSkeleton.data);
    case "AI_TOKEN_USAGE":
      return new AITokenUsage(eventSkeleton.userId, eventSkeleton.data);
    default:
      throw EventError.unsupportedEventType("Unknown event type");
  }
}

/**
 * Store the event using the appropriate storage adapter
 */
export async function storeEvent(
  event: Event,
  apiKeyId: string
): Promise<void> {
  const adapter = await StorageAdapterFactory.getStorageAdapter(
    event,
    apiKeyId
  );
  await adapter.add(event.serialize());
}
