import type {
  RegisterEventRequest,
  RegisterEventResponse,
} from "../../../gen/event/v1/event_pb";
import { RegisterEventResponseSchema } from "../../../gen/event/v1/event_pb";
import { create } from "@bufbuild/protobuf";
import { eventSchema } from "../../../zod/event";
import { type EventType } from "../../../interface/event/Event";
import { SDKCall } from "../../../events/RawEvents/SDKCall";
import { EventError } from "../../../errors/event";
import { AuthError } from "../../../errors/auth";
import { ZodError } from "zod";
import { StorageAdapterFactory } from "../../../factory";
import type { HandlerContext } from "@connectrpc/connect";
import { apiKeyContextKey } from "../../../context/auth";
import { logger } from "../../../errors/logger";

const OPERATION = "RegisterEvent";

export async function registerEvent(
  req: RegisterEventRequest,
  context: HandlerContext,
): Promise<RegisterEventResponse> {
  try {
    // Get API key ID from context (set by auth interceptor)
    const apiKeyId = context.values.get(apiKeyContextKey);
    if (!apiKeyId) {
      throw AuthError.invalidAPIKey("API key ID not found in context");
    }

    logger.logOperationInfo(OPERATION, "authenticated", "Request authenticated", {
      apiKeyId,
    });

    // Validate the incoming request against the schema
    let eventSkeleton;
    try {
      eventSkeleton = await eventSchema.parseAsync(req);
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

    // Create the appropriate event based on type
    let event: EventType;

    try {
      switch (eventSkeleton.type) {
        case "SDK_CALL":
          event = new SDKCall(eventSkeleton.userId, eventSkeleton.data);
          break;
        default:
          throw EventError.unsupportedEventType(eventSkeleton.type);
      }
    } catch (error) {
      if (error instanceof EventError) {
        throw error;
      }
      throw EventError.unknown(error as Error);
    }

    // Get the storage adapter and persist the event
    try {
      const adapter = await StorageAdapterFactory.getStorageAdapter(
        event,
        apiKeyId,
      );
      await adapter.add();
    } catch (error) {
      throw EventError.serializationError(
        "Failed to store event",
        error as Error,
      );
    }

    logger.logOperationInfo(OPERATION, "completed", "Event stored successfully", {
      apiKeyId,
      userId: eventSkeleton.userId,
    });

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
