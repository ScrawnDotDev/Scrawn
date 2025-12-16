import { describe, it, expect } from "vitest";
import { generateAPIKey } from "../../../utils/generateAPIKey";

describe("generateAPIKey", () => {
  it("generates API key with correct format", () => {
    const key = generateAPIKey();

    expect(key.startsWith("scrn_")).toBe(true);
    expect(key.length).toBe(5 + 32); // "scrn_" + 32 chars
    expect(key).toMatch(/^scrn_[A-Za-z0-9]{32}$/);
  });

  it("generates different keys on each call", () => {
    const key1 = generateAPIKey();
    const key2 = generateAPIKey();

    // Extremely unlikely to collide; good enough as a sanity check
    expect(key1).not.toBe(key2);
  });

  it("generates only alphanumeric characters after prefix", () => {
    const key = generateAPIKey();
    const keyPart = key.substring(5); // Remove "scrn_" prefix

    // Should not contain special characters that were replaced
    expect(keyPart).not.toContain("+");
    expect(keyPart).not.toContain("/");
    expect(keyPart).not.toContain("=");
  });
});
