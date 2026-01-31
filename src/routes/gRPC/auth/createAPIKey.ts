import type {
  CreateAPIKeyRequest,
  CreateAPIKeyResponse,
} from "../../../gen/auth/v1/auth_pb";
import { CreateAPIKeyResponseSchema } from "../../../gen/auth/v1/auth_pb";
import { create } from "@bufbuild/protobuf";
import { createAPIKeySchema } from "../../../zod/apikey";
import { APIKeyError } from "../../../errors/apikey";
import { AuthError } from "../../../errors/auth";
import { ZodError } from "zod";
import { generateAPIKey } from "../../../utils/generateAPIKey";
import { StorageAdapterFactory } from "../../../factory";
import { AddKey } from "../../../events/RawEvents/AddKey";
import type { HandlerContext } from "@connectrpc/connect";
import { apiKeyContextKey } from "../../../context/auth";
import { wideEventContextKey } from "../../../context/requestContext";
import { hashAPIKey } from "../../../utils/hashAPIKey";

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
  const now = new Date();
  const expiresInSeconds =
    typeof validatedData.expiresIn === "bigint"
      ? Number(validatedData.expiresIn)
      : validatedData.expiresIn;
  const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000);

  wideEventBuilder?.setApiKeyContext({ expiration: expiresAt.toISOString() });

  // Create and store the key
  const addKeyEvent = new AddKey({
    name: validatedData.name,
    key: apiKeyHash,
    expiresAt: expiresAt.toISOString(),
  });

  const adapter = await StorageAdapterFactory.getStorageAdapter(addKeyEvent);
  const keyEventData = await adapter.add(addKeyEvent.serialize());

  if (!keyEventData) {
    throw APIKeyError.creationFailed("Storage returned no ID");
  }

  return create(CreateAPIKeyResponseSchema, {
    apiKeyId: keyEventData.id,
    apiKey: apiKey,
    name: validatedData.name,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });
}

function validateRequest(req: CreateAPIKeyRequest) {
  try {
    return createAPIKeySchema.parse(req);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      throw APIKeyError.validationFailed(issues);
    }
    throw APIKeyError.validationFailed(
      error instanceof Error ? error.message : String(error)
    );
  }
}
