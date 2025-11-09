import { randomBytes } from "crypto";

export function generateAPIKey(): string {
  // Generate 24 random bytes and convert to base64 URL-safe
  // This gives us 32 alphanumeric characters
  const randomPart = randomBytes(24)
    .toString("base64")
    .replace(/[+/=]/g, (char) => {
      // Replace non-alphanumeric characters with random alphanumeric ones
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
