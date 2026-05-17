import { EventError } from "../errors/event";
import { AuthError } from "../errors/auth";
import type {
  Event,
  BasicUsageEventData,
  AITokenUsageEventData,
} from "../interface/event/Event";
import { BasicUsage } from "../events/BasicUsage";
import { AITokenUsage } from "../events/AITokenUsage";
import { StorageAdapterFactory } from "../factory";
import type {
  RegisterEventSchemaType,
  StreamEventSchemaType,
} from "../zod/event";
import type { AuthContext } from "../context/auth";

export function createEventInstance(
  eventSkeleton: RegisterEventSchemaType | StreamEventSchemaType
): Event {
  if (eventSkeleton.type === "BASIC_USAGE") {
    const data = eventSkeleton.basicusage;
    return new BasicUsage(
      eventSkeleton.userid,
      eventSkeleton.reportedtimestamp,
      data
    );
  }
  if (eventSkeleton.type === "AI_TOKEN_USAGE") {
    const data = eventSkeleton.aitokenusage;
    return new AITokenUsage(
      eventSkeleton.userid,
      eventSkeleton.reportedtimestamp,
      data
    );
  }
  throw EventError.unsupportedEventType("Unknown event type");
}

export async function storeEvent(
  event: Event,
  auth: AuthContext
): Promise<void> {
  if (!auth.mode) {
    throw AuthError.permissionDenied("Auth mode not set on API key");
  }

  const adapter = await StorageAdapterFactory.getEventStorageAdapter(
    event.type
  );
  await adapter.add(event.serialize(), auth.apiKeyId, auth.mode);
}
