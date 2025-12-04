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

  it("strips extra fields from payload", () => {
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
