import { EventError } from "../errors/event";
import type { Event, SDKCallEventData, AITokenUsageEventData } from "../interface/event/Event";
import { SDKCall } from "../events/SDKCall";
import { AITokenUsage } from "../events/AITokenUsage";
import { StorageAdapterFactory } from "../factory";
import type { RegisterEventSchemaType, StreamEventSchemaType } from "../zod/event";
import type { AuthContext } from "../context/auth";

export function createEventInstance(
  eventSkeleton: RegisterEventSchemaType | StreamEventSchemaType
): Event {
  if (eventSkeleton.type === "SDK_CALL") {
    const data = (eventSkeleton as { sdkcall: SDKCallEventData }).sdkcall;
    return new SDKCall(
      eventSkeleton.userid,
      eventSkeleton.reportedtimestamp,
      data
    );
  }
  if (eventSkeleton.type === "AI_TOKEN_USAGE") {
    const data = (eventSkeleton as { aitokenusage: AITokenUsageEventData }).aitokenusage;
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
  const adapter = await StorageAdapterFactory.getEventStorageAdapter(
    event.type
  );
  if (auth.mode) {
    await adapter.add(event.serialize(), auth.apiKeyId, auth.mode);
  } else {
    await adapter.add(event.serialize(), auth.apiKeyId);
  }
}
