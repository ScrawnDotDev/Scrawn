import { describe, it, expect } from "vitest";
import {
  createCheckoutLinkSchema,
  type CreateCheckoutLinkSchemaType,
} from "../../../zod/payment";

describe("createCheckoutLinkSchema", () => {
  describe("valid payloads", () => {
    it("should validate a correct payload with UUID", () => {
      const validPayload = {
        userId: "12345678-1234-4234-a234-123456789012",
      };

      const result = createCheckoutLinkSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.userId).toBe(validPayload.userId);
      }
    });

    it("should validate different UUID formats", () => {
      const uuids = [
        "12345678-1234-4234-a234-123456789012",
        "a1b2c3d4-e5f6-4890-abcd-ef1234567890",
        "00000000-0000-0000-0000-000000000000",
        "ffffffff-ffff-ffff-ffff-ffffffffffff",
      ];

      uuids.forEach((userId) => {
        const result = createCheckoutLinkSchema.safeParse({ userId });
        expect(result.success).toBe(true);
      });
    });

    it("should return typed data when valid", () => {
      const validPayload = {
        userId: "12345678-1234-4234-a234-123456789012",
      };

      const result = createCheckoutLinkSchema.safeParse(validPayload);

      if (result.success) {
        const data: CreateCheckoutLinkSchemaType = result.data;
        expect(data.userId).toBe(validPayload.userId);
      }
    });
  });

  describe("invalid payloads - missing userId", () => {
    it("should reject empty object", () => {
      const invalidPayload = {};

      const result = createCheckoutLinkSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });

    it("should reject null userId", () => {
      const invalidPayload = {
        userId: null,
      };

      const result = createCheckoutLinkSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it("should reject undefined userId", () => {
      const invalidPayload = {
        userId: undefined,
      };

      const result = createCheckoutLinkSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it("should have meaningful error message for missing userId", () => {
      const invalidPayload = {};

      const result = createCheckoutLinkSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
      if (!result.success) {
        const userIdIssue = result.error.issues.find(
          (issue) => issue.path[0] === "userId",
        );
        expect(userIdIssue).toBeDefined();
      }
    });
  });

  describe("invalid payloads - empty userId", () => {
    it("should reject empty string", () => {
      const invalidPayload = {
        userId: "",
      };

      const result = createCheckoutLinkSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
      if (!result.success) {
        const userIdIssue = result.error.issues.find(
          (issue) => issue.path[0] === "userId",
        );
        expect(userIdIssue?.message).toContain("Invalid UUID");
      }
    });

    it("should reject whitespace-only string", () => {
      const invalidPayload = {
        userId: "   ",
      };

      const result = createCheckoutLinkSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });
  });

  describe("invalid payloads - wrong type", () => {
    it("should reject number as userId", () => {
      const invalidPayload = {
        userId: 12345,
      };

      const result = createCheckoutLinkSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it("should reject boolean as userId", () => {
      const invalidPayload = {
        userId: true,
      };

      const result = createCheckoutLinkSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it("should reject object as userId", () => {
      const invalidPayload = {
        userId: { id: "12345678-1234-1234-1234-123456789012" },
      };

      const result = createCheckoutLinkSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it("should reject array as userId", () => {
      const invalidPayload = {
        userId: ["12345678-1234-1234-1234-123456789012"],
      };

      const result = createCheckoutLinkSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });
  });

  describe("invalid payloads - invalid UUID format", () => {
    it("should reject non-UUID string", () => {
      const invalidPayload = {
        userId: "not-a-uuid",
      };

      const result = createCheckoutLinkSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
      if (!result.success) {
        const userIdIssue = result.error.issues.find(
          (issue) => issue.path[0] === "userId",
        );
        expect(userIdIssue?.message).toContain("Invalid UUID");
      }
    });

    it("should reject UUID with wrong segment lengths", () => {
      const invalidUuids = [
        "123-1234-1234-1234-123456789012",
        "12345678-123-1234-1234-123456789012",
        "12345678-1234-123-1234-123456789012",
        "12345678-1234-1234-123-123456789012",
        "12345678-1234-1234-1234-12345678901",
      ];

      invalidUuids.forEach((userId) => {
        const result = createCheckoutLinkSchema.safeParse({ userId });
        expect(result.success).toBe(false);
      });
    });

    it("should reject UUID without hyphens", () => {
      const invalidPayload = {
        userId: "12345678123412341234123456789012",
      };

      const result = createCheckoutLinkSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it("should reject UUID with wrong hyphen positions", () => {
      const invalidPayload = {
        userId: "123456781-234-1234-1234-123456789012",
      };

      const result = createCheckoutLinkSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it("should reject UUID with invalid characters", () => {
      const invalidUuids = [
        "12345678-1234-1234-1234-12345678901g",
        "12345678-1234-1234-1234-12345678901G",
        "ZZZZZZZZ-1234-1234-1234-123456789012",
        "12345678-1234-1234-1234-12345678901!",
      ];

      invalidUuids.forEach((userId) => {
        const result = createCheckoutLinkSchema.safeParse({ userId });
        expect(result.success).toBe(false);
      });
    });

    it("should reject UUID that is too short", () => {
      const invalidPayload = {
        userId: "12345678-1234-1234-1234-12345678901",
      };

      const result = createCheckoutLinkSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it("should reject UUID that is too long", () => {
      const invalidPayload = {
        userId: "12345678-1234-1234-1234-1234567890123",
      };

      const result = createCheckoutLinkSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });
  });

  describe("extra fields handling", () => {
    it("should strip extra fields not in schema", () => {
      const payloadWithExtra = {
        userId: "12345678-1234-4234-a234-123456789012",
        extraField: "should be removed",
        anotherField: 123,
      };

      const result = createCheckoutLinkSchema.safeParse(payloadWithExtra);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty("extraField");
        expect(result.data).not.toHaveProperty("anotherField");
      }
    });

    it("should only contain userId property", () => {
      const validPayload = {
        userId: "12345678-1234-4234-a234-123456789012",
      };

      const result = createCheckoutLinkSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
      if (result.success) {
        const keys = Object.keys(result.data);
        expect(keys).toContain("userId");
        expect(keys).toHaveLength(1);
      }
    });
  });

  describe("schema parse vs safeParse", () => {
    it("should throw error with parse() on invalid payload", () => {
      const invalidPayload = {
        userId: "not-a-uuid",
      };

      expect(() => {
        createCheckoutLinkSchema.parse(invalidPayload);
      }).toThrow();
    });

    it("should not throw error with safeParse() on invalid payload", () => {
      const invalidPayload = {
        userId: "not-a-uuid",
      };

      expect(() => {
        createCheckoutLinkSchema.safeParse(invalidPayload);
      }).not.toThrow();
    });

    it("should return success: true for valid payload with safeParse", () => {
      const validPayload = {
        userId: "12345678-1234-4234-a234-123456789012",
      };

      const result = createCheckoutLinkSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
    });

    it("should return success: false for invalid payload with safeParse", () => {
      const invalidPayload = {
        userId: "invalid",
      };

      const result = createCheckoutLinkSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it("should return data for valid payload with parse()", () => {
      const validPayload = {
        userId: "12345678-1234-4234-a234-123456789012",
      };

      const data = createCheckoutLinkSchema.parse(validPayload);

      expect(data.userId).toBe(validPayload.userId);
    });
  });

  describe("error messages", () => {
    it("should provide clear error for empty userId", () => {
      const result = createCheckoutLinkSchema.safeParse({ userId: "" });

      expect(result.success).toBe(false);
      if (!result.success) {
        const message = result.error.issues[0].message;
        expect(message).toBe("Invalid UUID");
      }
    });

    it("should provide clear error for invalid UUID", () => {
      const result = createCheckoutLinkSchema.safeParse({
        userId: "not-a-uuid",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const message = result.error.issues[0].message;
        expect(message).toBe("Invalid UUID");
      }
    });

    it("should have path pointing to userId field", () => {
      const result = createCheckoutLinkSchema.safeParse({ userId: "" });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["userId"]);
      }
    });
  });

  describe("type inference", () => {
    it("should infer correct TypeScript type", () => {
      const validPayload = {
        userId: "12345678-1234-4234-a234-123456789012",
      };

      const result = createCheckoutLinkSchema.parse(validPayload);

      // Type check - this should compile without errors
      const userId: string = result.userId;
      expect(userId).toBe(validPayload.userId);
    });

    it("should match CreateCheckoutLinkSchemaType", () => {
      const validPayload: CreateCheckoutLinkSchemaType = {
        userId: "12345678-1234-4234-a234-123456789012",
      };

      const result = createCheckoutLinkSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should handle UUID with uppercase letters", () => {
      const validPayload = {
        userId: "12345678-ABCD-4234-ABCD-123456789012",
      };

      const result = createCheckoutLinkSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
    });

    it("should handle UUID with mixed case", () => {
      const validPayload = {
        userId: "12345678-AbCd-4234-8bcD-123456789012",
      };

      const result = createCheckoutLinkSchema.safeParse(validPayload);

      expect(result.success).toBe(true);
    });

    it("should reject userId with leading spaces", () => {
      const invalidPayload = {
        userId: " 12345678-1234-4234-a234-123456789012",
      };

      const result = createCheckoutLinkSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it("should reject userId with trailing spaces", () => {
      const invalidPayload = {
        userId: "12345678-1234-4234-a234-123456789012 ",
      };

      const result = createCheckoutLinkSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });

    it("should reject userId with newlines", () => {
      const invalidPayload = {
        userId: "12345678-1234-4234-a234-123456789012\n",
      };

      const result = createCheckoutLinkSchema.safeParse(invalidPayload);

      expect(result.success).toBe(false);
    });
  });
});
