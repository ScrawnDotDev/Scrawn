import type {
  RegisterUserRequest,
  RegisterUserResponse,
} from "../../../gen/user/v1/user_pb";
import {
  RegisterUserResponseSchema,
  RegisterUserRequestSchema,
} from "../../../gen/user/v1/user_pb";
import { registerUserSchema } from "../../../zod/user";
import { UserError } from "../../../errors/user";
import { ZodError } from "zod";
import { StorageAdapterFactory } from "../../../factory";
import { User } from "../../../events/RawEvents/User";
import type { HandlerContext } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import { toJson } from "@bufbuild/protobuf";
import { extractApiKeyFromContext } from "../../../utils/eventHelpers";

export async function registerUser(
  req: RegisterUserRequest,
  context: HandlerContext
): Promise<RegisterUserResponse> {
  const validatedData = validateRequest(req);

  const apiKeyId = extractApiKeyFromContext(context);

  const userEvent = new User({
    name: validatedData.name,
    email: validatedData.email,
  });

  const adapter = await StorageAdapterFactory.getEventStorageAdapter(
    userEvent.type
  );
  const userEventData = await adapter.add(userEvent.serialize(), apiKeyId);

  if (!userEventData) {
    throw UserError.creationFailed("Storage returned no ID");
  }

  return create(RegisterUserResponseSchema, {
    userId: userEventData.id,
    email: validatedData.email,
  });
}

function validateRequest(req: RegisterUserRequest) {
  try {
    const json = toJson(RegisterUserRequestSchema, req);
    return registerUserSchema.parse(json);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      throw UserError.validationFailed(issues);
    }
    throw UserError.validationFailed(
      error instanceof Error ? error.message : String(error)
    );
  }
}
