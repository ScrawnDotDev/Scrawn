import { createHmac } from "crypto";

const HMAC_SECRET = process.env.HMAC_SECRET;

if (!HMAC_SECRET) {
  throw new Error("HMAC_SECRET environment variable is not set");
}

// Type assertion after validation
const SECRET: string = HMAC_SECRET;

/**
 * Hash an API key using HMAC-SHA256
 * @param apiKey - The plaintext API key to hash
 * @returns The HMAC-SHA256 hash as a hex string
 */
export function hashAPIKey(apiKey: string): string {
  return createHmac("sha256", SECRET).update(apiKey).digest("hex");
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
