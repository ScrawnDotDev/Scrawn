import { randomBytes } from "crypto";
import { type ApiKeyRole, getRolePrefix } from "./keyFormat";

function generateRandomPart(): string {
  return randomBytes(24)
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
}

export function generateAPIKey(role?: ApiKeyRole): string {
  const prefix = role ? getRolePrefix(role) : "scrn_";
  return `${prefix}${generateRandomPart()}`;
}
