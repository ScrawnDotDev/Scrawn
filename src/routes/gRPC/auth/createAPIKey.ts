import type { sendUnaryData } from "@grpc/grpc-js";
import {
  CreateAPIKeyRequest,
  CreateAPIKeyResponse,
} from "../../../gen/auth/v1/auth_pb.js";
import type { WideEventBuilder } from "../../../context/requestContext";
import { apiKeyContextKey } from "../../../context/auth";
import { createAPIKeySchema } from "../../../zod/apikey";
import { APIKeyError } from "../../../errors/apikey";
import { AuthError } from "../../../errors/auth";
import { generateAPIKey } from "../../../utils/generateAPIKey";
import { wideEventContextKey } from "../../../context/requestContext";
import { hashAPIKey } from "../../../utils/hashAPIKey";
import { formatZodError } from "../../../utils/formatZodError";
import { DateTime } from "luxon";
import type { ContextUnaryCall } from "../../../interface/types/context.js";
import { StreamEventRequest } from "../../../gen/event/v1/event_pb.js";
import { createApiKey } from "../../../storage/db/postgres/helpers/apiKeys.js";

export async function createAPIKey(
  call: ContextUnaryCall<CreateAPIKeyRequest, CreateAPIKeyResponse>,
  callback: sendUnaryData<CreateAPIKeyResponse>
): Promise<void> {
  const c = call;
  const req = c.request;
  const wideEventBuilder = call[wideEventContextKey];

  try {
    // Get API key ID from context (set by auth interceptor)
    const apiKeyId = call[apiKeyContextKey] as string;
    if (!apiKeyId) {
      return callback?.(
        AuthError.invalidAPIKey("API key ID not found in context")
      );
    }

    // Validate the incoming request
    const validatedData = validateRequest(req);

    // Add business context to wide event
    wideEventBuilder?.setApiKeyContext({ name: validatedData.name });

    // Generate and hash the API key
    const apiKey = generateAPIKey();
    const apiKeyHash = hashAPIKey(apiKey);

    // Calculate expiration date
    const now = DateTime.utc();
    const expiresInSeconds =
      typeof validatedData.expiresIn === "bigint"
        ? Number(validatedData.expiresIn)
        : validatedData.expiresIn;
    const expiresAt = now.plus({ seconds: expiresInSeconds });

    wideEventBuilder?.setApiKeyContext({ expiration: expiresAt.toISO() });

    // Create and store the key
    const keyEventData = await createApiKey({
      name: validatedData.name,
      key: apiKeyHash,
      expiresAt: expiresAt.toISO(),
    });

    if (!keyEventData) {
      return callback?.(APIKeyError.creationFailed("Storage returned no ID"));
    }

    const response = new CreateAPIKeyResponse();
    response.setApikeyid(keyEventData.id);
    response.setApikey(apiKey);
    response.setName(validatedData.name);
    response.setCreatedat(now.toISO());
    response.setExpiresat(expiresAt.toISO());

    callback?.(null, response);
  } catch (error) {
    callback?.(error as Error);
  }
}

function validateRequest(req: CreateAPIKeyRequest) {
  try {
    const json = {
      name: req.getName(),
      expiresIn: req.getExpiresin(),
    };
    return createAPIKeySchema.parse(json);
  } catch (error) {
    throw formatZodError(error, (msg) => APIKeyError.validationFailed(msg));
  }
}
