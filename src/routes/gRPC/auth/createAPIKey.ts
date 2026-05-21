import type { sendUnaryData } from "@grpc/grpc-js";
import {
  CreateAPIKeyRequest,
  CreateAPIKeyResponse,
} from "../../../gen/auth/v1/auth";
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
import type { ApiKeyRole } from "../../../utils/keyFormat.js";
import { createApiKey } from "../../../storage/db/postgres/helpers/apiKeys.js";

export async function createAPIKey(
  call: ContextUnaryCall<CreateAPIKeyRequest, CreateAPIKeyResponse>,
  callback: sendUnaryData<CreateAPIKeyResponse>
): Promise<void> {
  const c = call;
  const req = c.request;
  const wideEventBuilder = call[wideEventContextKey];

  try {
    const auth = call[apiKeyContextKey];
    if (!auth) {
      return callback?.(AuthError.invalidAPIKey("API key context not found"));
    }

    if (auth.role !== "dashboard") {
      return callback?.(
        AuthError.permissionDenied("Only dashboard keys can create API keys")
      );
    }

    // Read role from gRPC metadata (not in proto message yet)
    const roleFromMeta = call.metadata.get("x-scrawn-role")?.[0] as string | undefined;
    const validatedData = validateRequest(req, roleFromMeta);

    if (validatedData.role === "dashboard" && auth.role !== "dashboard") {
      return callback?.(
        AuthError.permissionDenied("Only dashboard keys can create dashboard keys")
      );
    }

    wideEventBuilder?.setApiKeyContext({ name: validatedData.name });

    const apiKey = generateAPIKey(validatedData.role as ApiKeyRole);
    const apiKeyHash = hashAPIKey(apiKey);

    const now = DateTime.utc();
    const expiresInSeconds =
      typeof validatedData.expiresIn === "bigint"
        ? Number(validatedData.expiresIn)
        : validatedData.expiresIn;
    const expiresAt = now.plus({ seconds: expiresInSeconds });

    wideEventBuilder?.setApiKeyContext({ expiration: expiresAt.toISO() });

    const keyEventData = await createApiKey({
      name: validatedData.name,
      key: apiKeyHash,
      role: validatedData.role,
      expiresAt: expiresAt.toISO(),
    });

    if (!keyEventData) {
      return callback?.(APIKeyError.creationFailed("Storage returned no ID"));
    }

    const response = CreateAPIKeyResponse.create();
    response.apiKeyId = keyEventData.id;
    response.apiKey = apiKey;
    response.name = validatedData.name;
    response.createdAt = now.toISO();
    response.expiresAt = expiresAt.toISO();

    callback?.(null, response);
  } catch (error) {
    callback?.(error as Error);
  }
}

function validateRequest(req: CreateAPIKeyRequest, role?: string) {
  try {
    const json = {
      name: req.name,
      expiresIn: req.expiresIn,
      role: role || undefined,
    };
    return createAPIKeySchema.parse(json);
  } catch (error) {
    throw formatZodError(error, (msg) => APIKeyError.validationFailed(msg));
  }
}
