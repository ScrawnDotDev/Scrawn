import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("Error: JWT_SECRET environment variable is not set");
  process.exit(1);
}

// Generate a token that expires in 1 year
const payload = {
  id: randomUUID(),
  roles: ["sdk"],
  iat: Math.floor(Date.now() / 1000),
};

const token = jwt.sign(payload, JWT_SECRET, {
  expiresIn: "365d",
});

console.log("\n=== Generated Auth Token ===");
console.log(`Token: ${token}`);
console.log(`\nPayload:`);
console.log(`  id: ${payload.id}`);
console.log(`  roles: ${JSON.stringify(payload.roles)}`);
console.log(`  iat: ${payload.iat}\n`);
console.log(`Expires in: 365 days`);
console.log("\nUsage: 'Authorization: Bearer " + token + "'");
console.log("=== End Token ===\n");
