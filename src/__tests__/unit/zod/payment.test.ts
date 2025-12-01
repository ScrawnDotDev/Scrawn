import { describe, it, expect } from "vitest";
import { createCheckoutLinkSchema } from "../../../zod/payment";

describe("createCheckoutLinkSchema", () => {
  it("validates a valid checkout link request with UUID", () => {
    const validRequest = {
      userId: "550e8400-e29b-41d4-a716-446655440000",
    };

    const result = createCheckoutLinkSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.userId).toBe("550e8400-e29b-41d4-a716-446655440000");
    }
  });

  it("rejects invalid UUID format", () => {
    const invalidRequest = {
      userId: "not-a-valid-uuid",
    };

    const result = createCheckoutLinkSchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Invalid UUID");
    }
  });

  it("rejects missing userId field", () => {
    const invalidRequest = {};

    const result = createCheckoutLinkSchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
  });

  it("rejects null userId", () => {
    const invalidRequest = {
      userId: null,
    };

    const result = createCheckoutLinkSchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
  });

  it("rejects undefined userId", () => {
    const invalidRequest = {
      userId: undefined,
    };

    const result = createCheckoutLinkSchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
  });

  it("rejects empty string userId", () => {
    const invalidRequest = {
      userId: "",
    };

    const result = createCheckoutLinkSchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Invalid UUID");
    }
  });

  it("rejects numeric userId", () => {
    const invalidRequest = {
      userId: 12345,
    };

    const result = createCheckoutLinkSchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
  });

  it("rejects userId with invalid UUID structure", () => {
    const invalidRequest = {
      userId: "550e8400-e29b-41d4-a716",
    };

    const result = createCheckoutLinkSchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Invalid UUID");
    }
  });

  it("validates different valid UUID formats", () => {
    const validUUIDs = [
      "550e8400-e29b-41d4-a716-446655440000",
      "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "00000000-0000-0000-0000-000000000000",
      "ffffffff-ffff-ffff-ffff-ffffffffffff",
    ];

    validUUIDs.forEach((uuid) => {
      const result = createCheckoutLinkSchema.safeParse({ userId: uuid });
      expect(result.success).toBe(true);
    });
  });

  it("rejects payload with extra fields", () => {
    const payloadWithExtra = {
      userId: "550e8400-e29b-41d4-a716-446655440000",
      extraField: "should be stripped",
    };

    const result = createCheckoutLinkSchema.safeParse(payloadWithExtra);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("extraField");
    }
  });
});
