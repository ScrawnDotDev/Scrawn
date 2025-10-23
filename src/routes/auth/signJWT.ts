import { AuthError } from "../../errors/auth";
import jwt from "jsonwebtoken";
import { type UserPayload } from "../../types/auth";
import { type SignJWTRequest } from "../../gen/auth/v1/auth_pb";
import { DateTime } from "luxon";

export function signJWT(req: SignJWTRequest) {
  try {
    console.log("=== SignJWT Request ===");
    console.log("Payload:", req.payload);
    console.log("Payload type:", typeof req.payload);

    if (!req.payload) {
      throw AuthError.invalidPayload("Payload is required");
    }

    console.log("Creating UserPayload...");
    const payload: UserPayload = {
      id: req.payload.id || "",
      roles: Array.isArray(req.payload.roles) ? req.payload.roles : [],
      iat: DateTime.utc().toUnixInteger(),
    };

    console.log("Payload constructed:", payload);

    const secret = req.secret;
    console.log("Signing with secret length:", secret.length);

    const token = jwt.sign(payload, secret, {
      algorithm: "HS256",
    });

    console.log("Token generated successfully");

    return { token };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : "";
    console.error("=== SignJWT Error ===");
    console.error("Message:", errorMessage);
    console.error("Stack:", stack);
    throw AuthError.signingError(`Failed to sign JWT: ${errorMessage}`);
  }
}