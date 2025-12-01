import { describe, it, expect } from "vitest";
import { authSchema } from "../../../zod/auth";

describe("authSchema", () => {
  it("validates a valid auth payload", () => {
    const validPayload = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      roles: ["admin", "user"],
      iat: 1234567890,
    };

    const result = authSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validPayload);
    }
  });

  it("validates auth payload with empty roles array", () => {
    const validPayload = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      roles: [],
      iat: 1234567890,
    };

    const result = authSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("rejects invalid UUID in id field", () => {
    const invalidPayload = {
      id: "not-a-valid-uuid",
      roles: ["admin"],
      iat: 1234567890,
    };

    const result = authSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Invalid UUID");
    }
  });

  it("rejects missing id field", () => {
    const invalidPayload = {
      roles: ["admin"],
      iat: 1234567890,
    };

    const result = authSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });

  it("rejects non-array roles", () => {
    const invalidPayload = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      roles: "admin",
      iat: 1234567890,
    };

    const result = authSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });

  it("rejects roles array with non-string elements", () => {
    const invalidPayload = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      roles: ["admin", 123, "user"],
      iat: 1234567890,
    };

    const result = authSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });

  it("rejects missing iat field", () => {
    const invalidPayload = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      roles: ["admin"],
    };

    const result = authSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });

  it("rejects non-integer iat values", () => {
    const invalidPayload = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      roles: ["admin"],
      iat: 123.456,
    };

    const result = authSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });

  it("rejects non-number iat values", () => {
    const invalidPayload = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      roles: ["admin"],
      iat: "1234567890",
    };

    const result = authSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });

  it("rejects payload with extra fields", () => {
    const payloadWithExtra = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      roles: ["admin"],
      iat: 1234567890,
      extraField: "should be stripped",
    };

    const result = authSchema.safeParse(payloadWithExtra);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("extraField");
    }
  });
});
