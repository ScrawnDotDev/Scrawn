import { describe, it, expect } from "vitest";
import { AuthError, AuthErrorType } from "../errors/auth";
import { Code } from "@connectrpc/connect";

describe("AuthError", () => {
  describe("error creation", () => {
    it("should create errors with correct type and code", () => {
      const testCases = [
        {
          creator: () => AuthError.missingHeader(),
          type: AuthErrorType.MISSING_HEADER,
          code: Code.Unauthenticated,
        },
        {
          creator: () => AuthError.invalidHeaderFormat(),
          type: AuthErrorType.INVALID_HEADER_FORMAT,
          code: Code.Unauthenticated,
        },
        {
          creator: () => AuthError.invalidToken(),
          type: AuthErrorType.INVALID_TOKEN,
          code: Code.Unauthenticated,
        },
        {
          creator: () => AuthError.expiredToken(),
          type: AuthErrorType.EXPIRED_TOKEN,
          code: Code.Unauthenticated,
        },
        {
          creator: () => AuthError.invalidPayload(),
          type: AuthErrorType.INVALID_PAYLOAD,
          code: Code.Unauthenticated,
        },
        {
          creator: () => AuthError.signingError(),
          type: AuthErrorType.SIGNING_ERROR,
          code: Code.Unauthenticated,
        },
        {
          creator: () => AuthError.malformedPayload(),
          type: AuthErrorType.MALFORMED_PAYLOAD,
          code: Code.Unauthenticated,
        },
        {
          creator: () => AuthError.unknown(),
          type: AuthErrorType.UNKNOWN,
          code: Code.Internal,
        },
      ];

      testCases.forEach(({ creator, type, code }) => {
        const error = creator();
        expect(error.type).toBe(type);
        expect(error.code).toBe(code);
        expect(error.name).toBe("AuthError");
      });
    });

    it("should preserve original error when provided", () => {
      const originalError = new Error("test error");
      const error = AuthError.invalidToken(originalError);
      expect(error.originalError).toBe(originalError);
    });

    it("should handle optional original error", () => {
      const error = AuthError.invalidToken();
      expect(error.originalError).toBeUndefined();
    });

    it("should include details in payload error messages", () => {
      const error = AuthError.invalidPayload("test details");
      expect(error.rawMessage).toContain("test details");
    });

    it("should include details in signing error messages", () => {
      const error = AuthError.signingError("secret error");
      expect(error.rawMessage).toContain("secret error");
    });
  });
});
