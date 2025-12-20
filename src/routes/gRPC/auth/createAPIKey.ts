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
import { hashAPIKey } from "../../../utils/hashAPIKey";
import { logger } from "../../../errors/logger";

const OPERATION = "CreateAPIKey";

export async function createAPIKey(
  req: CreateAPIKeyRequest,
  context: HandlerContext,
): Promise<CreateAPIKeyResponse> {
  try {
    // Get API key ID from context (set by auth interceptor)
    const apiKeyId = context.values.get(apiKeyContextKey);
    if (!apiKeyId) {
      throw AuthError.invalidAPIKey("API key ID not found in context");
    }

    logger.logOperationInfo(
      OPERATION,
      "authenticated",
      "Request authenticated",
      {
        apiKeyId,
      },
    );

    // Validate the incoming request against the schema
    let validatedData;
    try {
      validatedData = createAPIKeySchema.parse(req);
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ");
        throw APIKeyError.validationFailed(issues, error);
      }
      throw APIKeyError.validationFailed(
        "Unknown validation error",
        error as Error,
      );
    }

    // Generate the actual API key
    const apiKey = generateAPIKey();

    // Hash the API key before storing
    const apiKeyHash = hashAPIKey(apiKey);

    // Calculate expiration date
    const now = new Date();
    const expiresInSeconds =
      typeof validatedData.expiresIn === "bigint"
        ? Number(validatedData.expiresIn)
        : validatedData.expiresIn;
    const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000);

    // Create AddKey event (store hash, not plaintext)
    const addKeyEvent = new AddKey({
      name: validatedData.name,
      key: apiKeyHash,
      expiresAt: expiresAt.toISOString(),
    });

    // Use storage adapter factory to persist the event
    let keyEventData: { id: string } | void;
    try {
      const adapter =
        await StorageAdapterFactory.getStorageAdapter(addKeyEvent);
      keyEventData = await adapter.add(addKeyEvent.serialize());
      if (!keyEventData) {
        throw APIKeyError.creationFailed("No ID returned");
      }
    } catch (error) {
      throw APIKeyError.creationFailed(
        "Failed to store API key",
        error as Error,
      );
    }

    logger.logOperationInfo(
      OPERATION,
      "completed",
      "API key created successfully",
      {
        apiKeyId: keyEventData.id,
        name: validatedData.name,
      },
    );

    return create(CreateAPIKeyResponseSchema, {
      apiKeyId: keyEventData.id,
      apiKey: apiKey,
      name: validatedData.name,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    logger.logOperationError(
      OPERATION,
      "failed",
      error instanceof APIKeyError ? error.type : "UNKNOWN",
      "CreateAPIKey handler failed",
      error instanceof Error ? error : undefined,
      { apiKeyId: context.values.get(apiKeyContextKey) },
    );

    // Re-throw APIKeyError as-is
    if (error instanceof APIKeyError) {
      throw error;
    }

    // Wrap unexpected errors
    throw APIKeyError.unknown(error as Error);
  }
}
