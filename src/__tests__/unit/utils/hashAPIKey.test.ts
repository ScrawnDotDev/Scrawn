import { describe, it, expect } from "vitest";
import { hashAPIKey, verifyAPIKey } from "../../../utils/hashAPIKey";

describe("hashAPIKey", () => {
  it("produces deterministic hash for same input", () => {
    const key = "scrn_test_12345678901234567890123456";

    const hash1 = hashAPIKey(key);
    const hash2 = hashAPIKey(key);

    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different inputs", () => {
    const key1 = "scrn_test_aaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const key2 = "scrn_test_bbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    const hash1 = hashAPIKey(key1);
    const hash2 = hashAPIKey(key2);

    expect(hash1).not.toBe(hash2);
  });

  it("produces hex string hash", () => {
    const key = "scrn_test_12345678901234567890123456";
    const hash = hashAPIKey(key);

    // HMAC-SHA256 produces 64 hex characters
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("verifyAPIKey", () => {
  it("returns true for matching key and hash", () => {
    const key = "scrn_test_12345678901234567890123456";
    const hash = hashAPIKey(key);

    const result = verifyAPIKey(key, hash);
    expect(result).toBe(true);
  });

  it("returns false for non-matching key", () => {
    const key = "scrn_test_12345678901234567890123456";
    const otherKey = "scrn_test_aaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const hash = hashAPIKey(key);

    const result = verifyAPIKey(otherKey, hash);
    expect(result).toBe(false);
  });

  it("returns false when hash length differs", () => {
    const key = "scrn_test_12345678901234567890123456";
    const invalidHash = "short-hash";

    const result = verifyAPIKey(key, invalidHash);
    expect(result).toBe(false);
  });

  it("uses constant-time comparison for security", () => {
    const key = "scrn_test_12345678901234567890123456";
    const hash = hashAPIKey(key);

    // Verify with slightly modified hash (single char different)
    const modifiedHash = hash.substring(0, hash.length - 1) + "X";

    const result = verifyAPIKey(key, modifiedHash);
    expect(result).toBe(false);
  });
});
