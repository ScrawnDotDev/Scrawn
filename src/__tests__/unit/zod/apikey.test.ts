import { describe, it, expect } from "vitest";
import { createAPIKeySchema } from "../../../zod/apikey";

describe("createAPIKeySchema", () => {
  it("validates a valid API key creation request", () => {
    const validRequest = {
      name: "My API Key",
      expiresIn: 86400,
    };

    const result = createAPIKeySchema.safeParse(validRequest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("My API Key");
      expect(result.data.expiresIn).toBe(86400);
    }
  });

  it("transforms bigint expiresIn to number", () => {
    const validRequest = {
      name: "Bigint Expiry Key",
      expiresIn: BigInt(3600),
    };

    const result = createAPIKeySchema.safeParse(validRequest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.expiresIn).toBe("number");
      expect(result.data.expiresIn).toBe(3600);
    }
  });

  it("rejects empty name", () => {
    const invalidRequest = {
      name: "",
      expiresIn: 3600,
    };

    const result = createAPIKeySchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("API key name is required");
    }
  });

  it("rejects name longer than 255 characters", () => {
    const invalidRequest = {
      name: "a".repeat(256),
      expiresIn: 3600,
    };

    const result = createAPIKeySchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "API key name must be less than 255 characters"
      );
    }
  });

  it("rejects non-integer expiresIn values", () => {
    const invalidRequest = {
      name: "Test Key",
      expiresIn: 123.456,
    };

    const result = createAPIKeySchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Expiration time must be an integer"
      );
    }
  });

  it("rejects expiresIn less than 60 seconds", () => {
    const invalidRequest = {
      name: "Test Key",
      expiresIn: 59,
    };

    const result = createAPIKeySchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Expiration time must be at least 60 seconds"
      );
    }
  });

  it("rejects expiresIn greater than 1 year", () => {
    const invalidRequest = {
      name: "Test Key",
      expiresIn: 365 * 24 * 60 * 60 + 1,
    };

    const result = createAPIKeySchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Expiration time cannot exceed 1 year"
      );
    }
  });
});
