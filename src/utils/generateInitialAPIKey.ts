import { randomBytes, createHmac } from "crypto";
import { randomUUID } from "crypto";

const HMAC_SECRET = process.env.HMAC_SECRET;

if (!HMAC_SECRET) {
  console.error("Error: HMAC_SECRET environment variable is not set. (check .env.example file)");
  process.exit(1);
}

// Type assertion after validation
const SECRET: string = HMAC_SECRET;

/**
 * Generate an API key in the same format as the main system
 */
function generateAPIKey(): string {
  const randomPart = randomBytes(24)
    .toString("base64")
    .replace(/[+/=]/g, (char) => {
      const replacements: { [key: string]: string } = {
        "+": "a",
        "/": "b",
        "=": "c",
      };
      return replacements[char] || char;
    })
    .substring(0, 32);

  return `scrn_${randomPart}`;
}

/**
 * Hash an API key using HMAC-SHA256
 */
function hashAPIKey(apiKey: string): string {
  return createHmac("sha256", SECRET).update(apiKey).digest("hex");
}

// Generate initial API key data
const apiKeyId = randomUUID();
const apiKey = generateAPIKey();
const apiKeyHash = hashAPIKey(apiKey);
const name = "Dashboard Key";
const createdAt = new Date().toISOString();
const expiresAt = new Date(
  Date.now() + 365 * 24 * 60 * 60 * 1000,
).toISOString(); // 1 year from now

console.log("\n=== Initial API Key Generated ===");
console.log("\nAPI Key Details:");
console.log(`  ID:         ${apiKeyId}`);
console.log(`  Key:        ${apiKey}`);
console.log(`  Name:       ${name}`);
console.log(`  Created At: ${createdAt}`);
console.log(`  Expires At: ${expiresAt}`);
console.log("\n\n=== SQL INSERT Statement ===\n");
console.log(
  `INSERT INTO api_keys (id, name, key, created_at, expires_at, revoked, revoked_at)`,
);
console.log(`VALUES (`);
console.log(`  '${apiKeyId}',`);
console.log(`  '${name}',`);
console.log(`  '${apiKeyHash}',`);
console.log(`  '${createdAt}',`);
console.log(`  '${expiresAt}',`);
console.log(`  false,`);
console.log(`  NULL`);
console.log(`);\n`);
console.log("\n=== Usage ===");
console.log(`Authorization: Bearer ${apiKey}`);
console.log("\n\n=== IMPORTANT ===");
console.log("1. The key is stored as an HMAC-SHA256 hash in the database");
console.log(
  "2. Run the SQL INSERT statement above in your PostgreSQL database",
);
console.log("3. Use the PLAINTEXT API key (above) in the Authorization header");
console.log(
  "4. Keep this API key secure - it will be used to generate new API keys",
);
console.log("5. The plaintext key is shown only once - save it now!");
console.log("=================\n");
