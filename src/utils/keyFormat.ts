export type ApiKeyRole = "dashboard" | "production" | "test";

const ROLE_PREFIXES: Record<string, ApiKeyRole> = {
  scrn_dash_: "dashboard",
  scrn_live_: "production",
  scrn_test_: "test",
};

const RANDOM_LENGTH = 32;
const PREFIX_LENGTHS: Record<ApiKeyRole, number> = {
  dashboard: "scrn_dash_".length + RANDOM_LENGTH,
  production: "scrn_live_".length + RANDOM_LENGTH,
  test: "scrn_test_".length + RANDOM_LENGTH,
}; // 42 chars total for each

const ROLE_TO_PREFIX: Record<ApiKeyRole, string> = {
  dashboard: "scrn_dash_",
  production: "scrn_live_",
  test: "scrn_test_",
};

/**
 * Parse an API key string to extract its role.
 * Determined from the prefix — no DB lookup needed.
 *
 * @returns The role if the prefix is valid, null otherwise.
 */
export function parseRoleFromApiKey(apiKey: string): ApiKeyRole | null {
  for (const [prefix, role] of Object.entries(ROLE_PREFIXES)) {
    if (apiKey.startsWith(prefix)) {
      return role;
    }
  }
  return null;
}

/**
 * Validate the full API key format for a given role.
 * Checks prefix matches and total length is correct.
 */
export function isValidApiKeyFormat(
  apiKey: string,
  role: ApiKeyRole
): boolean {
  const prefix = ROLE_TO_PREFIX[role];
  if (!prefix) return false;
  if (!apiKey.startsWith(prefix)) return false;
  if (apiKey.length !== PREFIX_LENGTHS[role]) return false;

  const randomPart = apiKey.slice(prefix.length);
  return /^[a-zA-Z0-9]+$/.test(randomPart);
}

/**
 * Get the expected prefix for a role.
 */
export function getRolePrefix(role: ApiKeyRole): string {
  return ROLE_TO_PREFIX[role]!;
}

/**
 * Get the mode string for data partitioning based on role.
 * - dashboard → null (sees all data)
 * - production → "production"
 * - test → "test"
 */
export function getModeForRole(role: ApiKeyRole): "production" | "test" | null {
  switch (role) {
    case "dashboard":
      return null;
    case "production":
      return "production";
    case "test":
      return "test";
  }
}
