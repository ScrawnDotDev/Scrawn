import { type GetRolesRequest } from "../../gen/auth/v1/auth_pb";
import { AuthError } from "../../errors/auth";
import type { HandlerContext } from "@connectrpc/connect";
import { userContextKey } from "../../context/auth";

export function getRoles(req: GetRolesRequest, context: HandlerContext) {
  try {
    console.log("=== GetRoles Request ===");
    console.log("Token:", req.token.substring(0, 20) + "...");

    const payload = context.values.get(userContextKey);

    if (!payload) {
      throw AuthError.invalidPayload(
        "User payload is missing in context",
      );
    }

    // Extract roles array from the payload
    const roles = payload.roles || [];

    console.log("Extracted roles:", roles);

    return { roles };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error("=== GetRoles Error ===");
    console.error("Message:", errorMessage);
    throw AuthError.invalidPayload(
      `Failed to extract roles from JWT: ${errorMessage}`,
    );
  }
}
