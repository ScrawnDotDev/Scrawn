import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { EventError } from "../../../errors/event";

// Mock fetchTagAmount before importing parseExpr
vi.mock("../../../utils/fetchTagAmount", () => ({
  fetchTagAmount: vi.fn(),
}));

import {
  parseAndEvaluateExpr,
  extractTagNames,
  validateExprSyntax,
} from "../../../utils/parseExpr";
import { fetchTagAmount } from "../../../utils/fetchTagAmount";

const mockFetchTagAmount = fetchTagAmount as Mock;

describe("parseExpr", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("extractTagNames", () => {
    it("extracts single tag name", () => {
      const tags = extractTagNames("tag(PREMIUM_CALL)");
      expect(tags).toEqual(["PREMIUM_CALL"]);
    });

    it("extracts multiple tag names", () => {
      const tags = extractTagNames("add(tag(PREMIUM),tag(FEE),100)");
      expect(tags).toEqual(["PREMIUM", "FEE"]);
    });

    it("extracts unique tag names when duplicates exist", () => {
      const tags = extractTagNames("add(tag(FEE),mul(tag(FEE),2))");
      expect(tags).toEqual(["FEE"]);
    });

    it("returns empty array when no tags present", () => {
      const tags = extractTagNames("add(100,200,300)");
      expect(tags).toEqual([]);
    });

    it("handles complex nested expressions", () => {
      const tags = extractTagNames(
        "add(mul(tag(PREMIUM_CALL),3),tag(EXTRA_FEE),250)"
      );
      expect(tags).toContain("PREMIUM_CALL");
      expect(tags).toContain("EXTRA_FEE");
      expect(tags).toHaveLength(2);
    });
  });

  describe("validateExprSyntax", () => {
    it("accepts valid simple expressions", () => {
      expect(() => validateExprSyntax("250")).not.toThrow();
      expect(() => validateExprSyntax("add(100,200)")).not.toThrow();
      expect(() => validateExprSyntax("tag(PREMIUM)")).not.toThrow();
    });

    it("accepts valid complex expressions", () => {
      expect(() =>
        validateExprSyntax("add(mul(tag(PREMIUM_CALL),3),tag(EXTRA_FEE),250)")
      ).not.toThrow();
    });

    it("rejects empty expressions", () => {
      expect(() => validateExprSyntax("")).toThrow(/cannot be empty/);
      expect(() => validateExprSyntax("   ")).toThrow(/cannot be empty/);
    });

    it("rejects unmatched opening parenthesis", () => {
      expect(() => validateExprSyntax("add(100,200")).toThrow(
        /unmatched opening parenthesis/
      );
    });

    it("rejects unmatched closing parenthesis", () => {
      expect(() => validateExprSyntax("add100,200)")).toThrow(
        /unmatched closing parenthesis/
      );
    });

    it("rejects unknown functions", () => {
      expect(() => validateExprSyntax("unknown(100)")).toThrow(
        /Unknown function in expression: unknown/
      );
    });

    it("rejects invalid tag name format", () => {
      expect(() => validateExprSyntax("tag(lowercase)")).toThrow(
        /Invalid tag name format/
      );
      expect(() => validateExprSyntax("tag(123INVALID)")).toThrow(
        /Invalid tag name format/
      );
    });

    it("accepts valid tag name formats", () => {
      expect(() => validateExprSyntax("tag(VALID_TAG)")).not.toThrow();
      expect(() => validateExprSyntax("tag(TAG123)")).not.toThrow();
      expect(() => validateExprSyntax("tag(_UNDERSCORE_START)")).not.toThrow();
    });
  });

  describe("parseAndEvaluateExpr", () => {
    describe("simple amounts", () => {
      it("evaluates plain numbers", async () => {
        const result = await parseAndEvaluateExpr("250");
        expect(result).toBe(250);
      });

      it("evaluates decimal numbers and floors result", async () => {
        const result = await parseAndEvaluateExpr("250.7");
        expect(result).toBe(250);
      });
    });

    describe("add operation", () => {
      it("adds two numbers", async () => {
        const result = await parseAndEvaluateExpr("add(100,200)");
        expect(result).toBe(300);
      });

      it("adds multiple numbers", async () => {
        const result = await parseAndEvaluateExpr("add(100,200,300,400)");
        expect(result).toBe(1000);
      });
    });

    describe("sub operation", () => {
      it("subtracts two numbers", async () => {
        const result = await parseAndEvaluateExpr("sub(500,200)");
        expect(result).toBe(300);
      });

      it("handles negative results", async () => {
        const result = await parseAndEvaluateExpr("sub(100,250)");
        expect(result).toBe(-150);
      });
    });

    describe("mul operation", () => {
      it("multiplies two numbers", async () => {
        const result = await parseAndEvaluateExpr("mul(10,20)");
        expect(result).toBe(200);
      });

      it("multiplies multiple numbers", async () => {
        const result = await parseAndEvaluateExpr("mul(2,3,4,5)");
        expect(result).toBe(120);
      });
    });

    describe("div operation", () => {
      it("divides two numbers", async () => {
        const result = await parseAndEvaluateExpr("div(100,4)");
        expect(result).toBe(25);
      });

      it("floors the result of division", async () => {
        const result = await parseAndEvaluateExpr("div(100,3)");
        expect(result).toBe(33); // 100/3 = 33.333... → 33
      });

      it("throws error on division by zero", async () => {
        await expect(parseAndEvaluateExpr("div(100,0)")).rejects.toThrow(
          /Division by zero/
        );
      });
    });

    describe("tag resolution", () => {
      it("resolves single tag", async () => {
        mockFetchTagAmount.mockResolvedValue(500);

        const result = await parseAndEvaluateExpr("tag(PREMIUM_CALL)");

        expect(result).toBe(500);
        expect(mockFetchTagAmount).toHaveBeenCalledWith(
          "PREMIUM_CALL",
          "Tag not found: PREMIUM_CALL"
        );
      });

      it("resolves multiple tags", async () => {
        mockFetchTagAmount
          .mockResolvedValueOnce(100) // PREMIUM
          .mockResolvedValueOnce(50); // FEE

        const result = await parseAndEvaluateExpr("add(tag(PREMIUM),tag(FEE))");

        expect(result).toBe(150);
        expect(mockFetchTagAmount).toHaveBeenCalledTimes(2);
      });

      it("throws error when tag not found", async () => {
        mockFetchTagAmount.mockRejectedValue(
          EventError.validationFailed("Tag not found: UNKNOWN_TAG")
        );

        await expect(
          parseAndEvaluateExpr("tag(UNKNOWN_TAG)")
        ).rejects.toThrow(/Tag not found/);
      });
    });

    describe("complex expressions", () => {
      it("evaluates nested operations", async () => {
        // add(mul(10,3),sub(100,20),50) = 30 + 80 + 50 = 160
        const result = await parseAndEvaluateExpr(
          "add(mul(10,3),sub(100,20),50)"
        );
        expect(result).toBe(160);
      });

      it("evaluates expression with tags and operations", async () => {
        mockFetchTagAmount
          .mockResolvedValueOnce(100) // PREMIUM_CALL
          .mockResolvedValueOnce(50); // EXTRA_FEE

        // add(mul(tag(PREMIUM_CALL),3),tag(EXTRA_FEE),250) = 300 + 50 + 250 = 600
        const result = await parseAndEvaluateExpr(
          "add(mul(tag(PREMIUM_CALL),3),tag(EXTRA_FEE),250)"
        );

        expect(result).toBe(600);
      });

      it("handles deeply nested expressions", async () => {
        // div(mul(add(10,20),sub(50,10)),4) = div(mul(30,40),4) = div(1200,4) = 300
        const result = await parseAndEvaluateExpr(
          "div(mul(add(10,20),sub(50,10)),4)"
        );
        expect(result).toBe(300);
      });
    });

    describe("error handling", () => {
      it("throws EventError for invalid syntax", async () => {
        await expect(parseAndEvaluateExpr("add(100,")).rejects.toThrow(
          /unmatched opening parenthesis/
        );
      });

      it("throws EventError for unknown functions", async () => {
        await expect(parseAndEvaluateExpr("unknown(100)")).rejects.toThrow(
          /Unknown function/
        );
      });

      it("throws EventError for empty expression", async () => {
        await expect(parseAndEvaluateExpr("")).rejects.toThrow(
          /cannot be empty/
        );
      });
    });
  });
});
