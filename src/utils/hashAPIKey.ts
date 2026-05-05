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


