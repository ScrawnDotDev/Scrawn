import type { CreateAPIKeyRequest, CreateAPIKeyResponse } from "../../../gen/auth/v1/auth_pb";
import { CreateAPIKeyResponseSchema, CreateAPIKeyRequestSchema } from "../../../gen/auth/v1/auth_pb";
import { createAPIKeySchema } from "../../../zod/apikey";
import { APIKeyError } from "../../../errors/apikey";
import { AuthError } from "../../../errors/auth";
import { generateAPIKey } from "../../../utils/generateAPIKey";
import { StorageAdapterFactory } from "../../../factory";
import { AddKey } from "../../../events/RawEvents/AddKey";
import type { HandlerContext } from "@connectrpc/connect";
import { apiKeyContextKey } from "../../../context/auth";
import { wideEventContextKey } from "../../../context/requestContext";
import { hashAPIKey } from "../../../utils/hashAPIKey";
import { create } from "@bufbuild/protobuf";
import { toJson } from "@bufbuild/protobuf";
import { formatZodError } from "../../../utils/formatZodError";
import { DateTime } from "luxon";

export async function createAPIKey(
  req: CreateAPIKeyRequest,
  context: HandlerContext
): Promise<CreateAPIKeyResponse> {
  const wideEventBuilder = context.values.get(wideEventContextKey);

  // Get API key ID from context (set by auth interceptor)
  const apiKeyId = context.values.get(apiKeyContextKey);
  if (!apiKeyId) {
    throw AuthError.invalidAPIKey("API key ID not found in context");
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
  const addKeyEvent = new AddKey({
    name: validatedData.name,
    key: apiKeyHash,
    expiresAt: expiresAt.toISO(),
  });

  const adapter = await StorageAdapterFactory.getEventStorageAdapter(
    addKeyEvent.type
  );
  const keyEventData = await adapter.add(addKeyEvent.serialize(), "");

  if (!keyEventData) {
    throw APIKeyError.creationFailed("Storage returned no ID");
  }

  return create(CreateAPIKeyResponseSchema, {
    apiKeyId: keyEventData.id,
    apiKey: apiKey,
    name: validatedData.name,
    createdAt: now.toISO(),
    expiresAt: expiresAt.toISO(),
  });
}

function validateRequest(req: CreateAPIKeyRequest) {
  try {
    const json = toJson(CreateAPIKeyRequestSchema, req);
    return createAPIKeySchema.parse(json);
  } catch (error) {
    throw formatZodError(error, (msg) => APIKeyError.validationFailed(msg));
  }
}