import { describe, it, expect } from "vitest";
import {
  USER_ID_CONFIG,
  type UserId,
  parseUserId,
  safeParseUserId,
} from "../../../config/identifiers";

describe("Identifier Configuration", () => {
  describe("USER_ID_CONFIG", () => {
    it("should have a validator property", () => {
      expect(USER_ID_CONFIG).toHaveProperty("validator");
      expect(USER_ID_CONFIG.validator).toBeDefined();
    });

    it("should have a dbType property", () => {
      expect(USER_ID_CONFIG).toHaveProperty("dbType");
      expect(USER_ID_CONFIG.dbType).toBeDefined();
    });
  });

  describe("parseUserId", () => {
    describe("with UUID config", () => {
      it("should parse valid UUID", () => {
        const validUuid = "550e8400-e29b-41d4-a716-446655440000";
        const result = parseUserId(validUuid);
        expect(result).toBe(validUuid);
      });

      it("should throw on invalid UUID format", () => {
        expect(() => parseUserId("not-a-uuid")).toThrow();
      });

      it("should throw on empty string", () => {
        expect(() => parseUserId("")).toThrow();
      });

      it("should throw on null", () => {
        expect(() => parseUserId(null)).toThrow();
      });

      it("should throw on undefined", () => {
        expect(() => parseUserId(undefined)).toThrow();
      });

      it("should throw on number when expecting UUID", () => {
        expect(() => parseUserId(123)).toThrow();
      });

      it("should throw on object", () => {
        expect(() => parseUserId({ id: "123" })).toThrow();
      });

      it("should accept lowercase UUID", () => {
        const uuid = "550e8400-e29b-41d4-a716-446655440000";
        expect(() => parseUserId(uuid)).not.toThrow();
      });

      it("should accept uppercase UUID", () => {
        const uuid = "550E8400-E29B-41D4-A716-446655440000";
        expect(() => parseUserId(uuid)).not.toThrow();
      });

      it("should reject UUID with missing hyphens", () => {
        expect(() => parseUserId("550e8400e29b41d4a716446655440000")).toThrow();
      });

      it("should reject UUID with too many characters", () => {
        expect(() =>
          parseUserId("550e8400-e29b-41d4-a716-446655440000-extra"),
        ).toThrow();
      });

      it("should reject UUID with invalid characters", () => {
        expect(() => parseUserId("550e8400-e29b-41d4-a716-44665544000g")).toThrow();
      });
    });

    describe("type inference", () => {
      it("should infer correct type from config", () => {
        const userId: UserId = parseUserId(
          "550e8400-e29b-41d4-a716-446655440000",
        );
        
        // Type assertion to verify UserId type matches expected type
        // This will cause a compile error if types don't match
        const _typeCheck: string = userId;
        expect(typeof userId).toBe("string");
      });
    });
  });

  describe("safeParseUserId", () => {
    it("should return valid UUID when input is valid", () => {
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";
      const result = safeParseUserId(validUuid);
      expect(result).toBe(validUuid);
    });

    it("should return undefined for invalid UUID", () => {
      const result = safeParseUserId("not-a-uuid");
      expect(result).toBeUndefined();
    });

    it("should return undefined for null", () => {
      const result = safeParseUserId(null);
      expect(result).toBeUndefined();
    });

    it("should return undefined for undefined", () => {
      const result = safeParseUserId(undefined);
      expect(result).toBeUndefined();
    });

    it("should return undefined for empty string", () => {
      const result = safeParseUserId("");
      expect(result).toBeUndefined();
    });

    it("should return undefined for number when expecting UUID", () => {
      const result = safeParseUserId(123);
      expect(result).toBeUndefined();
    });

    it("should not throw on invalid input", () => {
      expect(() => safeParseUserId("invalid")).not.toThrow();
      expect(() => safeParseUserId(null)).not.toThrow();
      expect(() => safeParseUserId(undefined)).not.toThrow();
    });

    it("should handle multiple invalid attempts gracefully", () => {
      const invalidInputs = ["invalid", 123, null, undefined, "", {}];
      
      invalidInputs.forEach((input) => {
        const result = safeParseUserId(input);
        expect(result).toBeUndefined();
      });
    });
  });

  describe("edge cases", () => {
    it("should handle special UUID v4 format", () => {
      // UUID v4 has specific version bits
      const uuidV4 = "123e4567-e89b-42d3-a456-426614174000";
      expect(() => parseUserId(uuidV4)).not.toThrow();
    });

    it("should handle nil UUID (all zeros)", () => {
      const nilUuid = "00000000-0000-0000-0000-000000000000";
      expect(() => parseUserId(nilUuid)).not.toThrow();
    });

    it("should handle max UUID (all F's)", () => {
      const maxUuid = "ffffffff-ffff-ffff-ffff-ffffffffffff";
      expect(() => parseUserId(maxUuid)).not.toThrow();
    });
  });

  describe("consistency", () => {
    it("parseUserId and safeParseUserId should agree on valid input", () => {
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";
      
      const parseResult = parseUserId(validUuid);
      const safeParseResult = safeParseUserId(validUuid);
      
      expect(parseResult).toBe(safeParseResult);
    });

    it("validator should match parseUserId behavior", () => {
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";
      
      const validatorResult = USER_ID_CONFIG.validator.parse(validUuid);
      const parseResult = parseUserId(validUuid);
      
      expect(validatorResult).toBe(parseResult);
    });

    it("should maintain immutability of config", () => {
      const originalValidator = USER_ID_CONFIG.validator;
      const originalDbType = USER_ID_CONFIG.dbType;
      
      // Attempt to use the config
      parseUserId("550e8400-e29b-41d4-a716-446655440000");
      
      // Config should remain unchanged
      expect(USER_ID_CONFIG.validator).toBe(originalValidator);
      expect(USER_ID_CONFIG.dbType).toBe(originalDbType);
    });
  });
});
