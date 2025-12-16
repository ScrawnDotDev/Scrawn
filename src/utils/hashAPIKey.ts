import { createHmac } from "crypto";

// Lazily retrieve HMAC_SECRET to allow test setup to run first
function getSecret(): string {
  const secret = process.env.HMAC_SECRET;
  if (!secret) {
    throw new Error("HMAC_SECRET environment variable is not set");
  }
  return secret;
}

export function hashAPIKey(apiKey: string): string {
  return createHmac("sha256", getSecret()).update(apiKey).digest("hex");
}

/**
 * Verify an API key against a stored hash
 * @param apiKey - The plaintext API key to verify
 * @param hash - The stored hash to compare against
 * @returns True if the API key matches the hash
 */
export function verifyAPIKey(apiKey: string, hash: string): boolean {
  const computedHash = hashAPIKey(apiKey);

  // Use constant-time comparison to prevent timing attacks
  if (computedHash.length !== hash.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < computedHash.length; i++) {
    result |= computedHash.charCodeAt(i) ^ hash.charCodeAt(i);
  }

  return result === 0;
}
