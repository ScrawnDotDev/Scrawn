import {
  RegisterEventRequest,
  RegisterEventResponse,
} from "../../../gen/event/v1/event";
import type { WideEventBuilder } from "../../../context/requestContext";
import { apiKeyContextKey } from "../../../context/auth";
import { wideEventContextKey } from "../../../context/requestContext";
import { registerEventSchema } from "../../../zod/event";
import { EventError } from "../../../errors/event";
import { AuthError } from "../../../errors/auth";
import { createEventInstance, storeEvent } from "../../../utils/eventHelpers";
import { ZodError } from "zod";
import type { ContextUnaryCall } from "../../../interface/types/context.js";
import type { sendUnaryData } from "@grpc/grpc-js";

export async function registerEvent(
  call: ContextUnaryCall<RegisterEventRequest, RegisterEventResponse>,
  callback: sendUnaryData<RegisterEventResponse>
): Promise<void> {
  const c = call;
  const req = c.request;
  const wideEventBuilder = call[wideEventContextKey];

  try {
    const auth = call[apiKeyContextKey];
    if (!auth) {
      return callback?.(AuthError.invalidAPIKey("API key context not found"));
    }

    if (auth.role === "dashboard") {
      return callback?.(
        AuthError.permissionDenied("Dashboard keys cannot ingest events")
      );
    }

    const eventSkeleton = await registerEventSchema.parseAsync({ ...req });

    wideEventBuilder?.setUser(eventSkeleton.userId);
    wideEventBuilder?.setEventContext({ eventType: eventSkeleton.type });

    const event = createEventInstance(eventSkeleton);
    await storeEvent(event, auth);

    const response = RegisterEventResponse.create();
    response.random = "Event stored successfully";
    callback?.(null, response);
  } catch (error) {
    callback?.(error as Error);
  }
}
