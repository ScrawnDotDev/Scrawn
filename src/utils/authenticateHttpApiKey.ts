import { AuthError } from "../errors/auth";
import { apiKeyCache } from "./apiKeyCache";
import { findApiKeyByHash } from "../storage/db/postgres/helpers/apiKeys";
import { hashAPIKey } from "./hashAPIKey";
import { DateTime } from "luxon";
import {
  parseRoleFromApiKey,
  isValidApiKeyFormat,
  getModeForRole,
} from "./keyFormat";
import type { ApiKeyRole } from "./keyFormat";
import type { AuthContext } from "../context/auth";

export async function authenticateHttpApiKey(
  authHeader: string | undefined
): Promise<AuthContext> {
  if (!authHeader) {
    throw AuthError.missingHeader();
  }

  if (!authHeader.startsWith("Bearer ")) {
    throw AuthError.invalidHeaderFormat();
  }

  const apiKey = authHeader.slice("Bearer ".length).trim();

  const role = parseRoleFromApiKey(apiKey);
  if (!role) {
    throw AuthError.invalidAPIKey(
      "Invalid key prefix — expected scrn_dash_, scrn_live_, or scrn_test_"
    );
  }

  if (!isValidApiKeyFormat(apiKey, role)) {
    throw AuthError.invalidAPIKey("Invalid API key format");
  }

  const apiKeyHash = hashAPIKey(apiKey);

  const cached = apiKeyCache.get(apiKeyHash);
  if (cached) {
    if (cached.role !== role) {
      throw AuthError.roleMismatch(
        `Key prefix ${role} doesn't match stored role ${cached.role}`
      );
    }
    return { apiKeyId: cached.id, role: cached.role, mode: cached.mode };
  }

  const apiKeyRecord = await findApiKeyByHash(apiKeyHash);

  if (!apiKeyRecord) {
    throw AuthError.invalidAPIKey("API key not found");
  }

  if (apiKeyRecord.revoked) {
    throw AuthError.revokedAPIKey();
  }

  if (
    DateTime.utc() > DateTime.fromISO(apiKeyRecord.expiresAt, { zone: "utc" })
  ) {
    throw AuthError.expiredAPIKey();
  }

  if (apiKeyRecord.role !== role) {
    throw AuthError.roleMismatch(
      `Key prefix ${role} doesn't match stored role ${apiKeyRecord.role}`
    );
  }

  const recordRole = apiKeyRecord.role as ApiKeyRole;
  const mode = getModeForRole(recordRole);

  apiKeyCache.set(apiKeyHash, {
    id: apiKeyRecord.id,
    role: recordRole,
    mode,
    expiresAt: apiKeyRecord.expiresAt,
  });

  return { apiKeyId: apiKeyRecord.id, role: recordRole, mode };
}
