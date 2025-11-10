/**
 * Configuration Type Switch Tests
 * 
 * These tests demonstrate how the system behaves with different ID type configs.
 * Uncomment the relevant test suite based on your current USER_ID_CONFIG setting.
 * 
 * ⚠️ Only one suite should be active at a time, matching your config!
 */

import { describe, it, expect } from "vitest";
import { parseUserId, safeParseUserId, type UserId } from "../../../config/identifiers";

/**
 * TEST SUITE FOR UUID CONFIGURATION
 * Active when: USER_ID_CONFIG = ID_CONFIGS.uuid
 */
describe("UUID Configuration Tests", () => {
  describe("parseUserId with UUID config", () => {
    it("should accept valid UUIDs", () => {
      const validUuids = [
        "550e8400-e29b-41d4-a716-446655440000",
        "123e4567-e89b-42d3-a456-426614174000",
        "00000000-0000-0000-0000-000000000000",
        "ffffffff-ffff-ffff-ffff-ffffffffffff",
      ];

      validUuids.forEach((uuid) => {
        const result = parseUserId(uuid);
        expect(result).toBe(uuid);
        expect(typeof result).toBe("string");
      });
    });

    it("should reject non-UUID strings", () => {
      const invalidInputs = [
        "12345",
        "not-a-uuid",
        "550e8400",
        "550e8400e29b41d4a716446655440000", // missing hyphens
      ];

      invalidInputs.forEach((input) => {
        expect(() => parseUserId(input)).toThrow();
      });
    });

    it("should reject numbers", () => {
      expect(() => parseUserId(123)).toThrow();
      expect(() => parseUserId(123n)).toThrow();
    });

    it("UserId type should be string", () => {
      const id: UserId = parseUserId("550e8400-e29b-41d4-a716-446655440000");
      const _typeCheck: string = id; // Compile-time type check
      expect(typeof id).toBe("string");
    });
  });

  describe("safeParseUserId with UUID config", () => {
    it("should return UUID string for valid input", () => {
      const uuid = "550e8400-e29b-41d4-a716-446655440000";
      const result = safeParseUserId(uuid);
      expect(result).toBe(uuid);
    });

    it("should return undefined for invalid UUID", () => {
      expect(safeParseUserId("not-a-uuid")).toBeUndefined();
      expect(safeParseUserId(123)).toBeUndefined();
      expect(safeParseUserId(123n)).toBeUndefined();
    });
  });
});

/**
 * TEST SUITE FOR BIGINT CONFIGURATION
 * Active when: USER_ID_CONFIG = ID_CONFIGS.bigint
 * 
 * ⚠️ Uncomment this suite and comment out UUID tests when using bigint config
 */
/*
describe("BigInt Configuration Tests", () => {
  describe("parseUserId with bigint config", () => {
    it("should accept valid bigints", () => {
      const validBigInts = [
        123n,
        9007199254740991n,
        1n,
        0n,
      ];

      validBigInts.forEach((bigInt) => {
        const result = parseUserId(bigInt);
        expect(result).toBe(bigInt);
        expect(typeof result).toBe("bigint");
      });
    });

    it("should reject strings when bigint expected", () => {
      expect(() => parseUserId("123")).toThrow();
      expect(() => parseUserId("550e8400-e29b-41d4-a716-446655440000")).toThrow();
    });

    it("should reject regular numbers", () => {
      expect(() => parseUserId(123)).toThrow();
    });

    it("UserId type should be bigint", () => {
      const id: UserId = parseUserId(123n);
      const _typeCheck: bigint = id; // Compile-time type check
      expect(typeof id).toBe("bigint");
    });
  });

  describe("safeParseUserId with bigint config", () => {
    it("should return bigint for valid input", () => {
      const result = safeParseUserId(123n);
      expect(result).toBe(123n);
      expect(typeof result).toBe("bigint");
    });

    it("should return undefined for non-bigint input", () => {
      expect(safeParseUserId("123")).toBeUndefined();
      expect(safeParseUserId(123)).toBeUndefined();
      expect(safeParseUserId("550e8400-e29b-41d4-a716-446655440000")).toBeUndefined();
    });
  });
});
*/

/**
 * TEST SUITE FOR INT CONFIGURATION
 * Active when: USER_ID_CONFIG = ID_CONFIGS.int
 * 
 * ⚠️ Uncomment this suite and comment out UUID tests when using int config
 */
/*
describe("Int Configuration Tests", () => {
  describe("parseUserId with int config", () => {
    it("should accept valid integers", () => {
      const validInts = [
        123,
        1,
        0,
        -1,
        999999,
      ];

      validInts.forEach((int) => {
        const result = parseUserId(int);
        expect(result).toBe(int);
        expect(typeof result).toBe("number");
      });
    });

    it("should reject floats", () => {
      expect(() => parseUserId(123.45)).toThrow();
    });

    it("should reject strings when int expected", () => {
      expect(() => parseUserId("123")).toThrow();
      expect(() => parseUserId("550e8400-e29b-41d4-a716-446655440000")).toThrow();
    });

    it("should reject bigints", () => {
      expect(() => parseUserId(123n)).toThrow();
    });

    it("UserId type should be number", () => {
      const id: UserId = parseUserId(123);
      const _typeCheck: number = id; // Compile-time type check
      expect(typeof id).toBe("number");
    });
  });

  describe("safeParseUserId with int config", () => {
    it("should return number for valid input", () => {
      const result = safeParseUserId(123);
      expect(result).toBe(123);
      expect(typeof result).toBe("number");
    });

    it("should return undefined for non-int input", () => {
      expect(safeParseUserId("123")).toBeUndefined();
      expect(safeParseUserId(123n)).toBeUndefined();
      expect(safeParseUserId(123.45)).toBeUndefined();
      expect(safeParseUserId("550e8400-e29b-41d4-a716-446655440000")).toBeUndefined();
    });
  });
});
*/

/**
 * Configuration-Agnostic Tests
 * These tests work regardless of which config is active
 */
describe("Configuration-Agnostic Tests", () => {
  describe("error handling", () => {
    it("parseUserId should throw on null", () => {
      expect(() => parseUserId(null)).toThrow();
    });

    it("parseUserId should throw on undefined", () => {
      expect(() => parseUserId(undefined)).toThrow();
    });

    it("safeParseUserId should return undefined on null", () => {
      expect(safeParseUserId(null)).toBeUndefined();
    });

    it("safeParseUserId should return undefined on undefined", () => {
      expect(safeParseUserId(undefined)).toBeUndefined();
    });
  });

  describe("type safety", () => {
    it("UserId type should exist and be usable", () => {
      // This is a compile-time check - if UserId type is broken, this won't compile
      type TestUserId = UserId;
      const _typeExists: TestUserId = undefined as any;
      expect(true).toBe(true);
    });
  });
});
