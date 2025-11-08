import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { signJWT } from "../../../routes/auth/signJWT";
import { AuthError } from "../../../errors/auth";
import { isAuthError } from "../../helpers/error";
import type { SignJWTRequest } from "../../../gen/auth/v1/auth_pb";
import type { UserPayload } from "../../../types/auth";

vi.mock("jsonwebtoken", () => ({
  default: {
    sign: vi.fn(),
  },
}));

import jwt from "jsonwebtoken";

describe("signJWT", () => {
  let mockRequest: SignJWTRequest;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockRequest = {
      payload: {
        id: "user-123",
        roles: ["admin", "user"],
      } as any,
      secret: "test-secret-key",
    } as SignJWTRequest;

    (jwt.sign as any).mockReturnValue(
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature",
    );
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("successful JWT signing", () => {
    it("should sign JWT with valid payload and return token", () => {
      const mockToken =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature";
      (jwt.sign as any).mockReturnValue(mockToken);

      const result = signJWT(mockRequest);

      expect(result.token).toBe(mockToken);
      expect(jwt.sign).toHaveBeenCalled();
    });

    it("should use HS256 algorithm for signing", () => {
      (jwt.sign as any).mockReturnValue("token");

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      expect(callArgs[2].algorithm).toBe("HS256");
    });

    it("should include id in payload", () => {
      (jwt.sign as any).mockReturnValue("token");

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      const payload = callArgs[0];
      expect(payload.id).toBe("user-123");
    });

    it("should include roles array in payload", () => {
      (jwt.sign as any).mockReturnValue("token");

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      const payload = callArgs[0];
      expect(payload.roles).toEqual(["admin", "user"]);
    });

    it("should include iat (issued at) timestamp in payload", () => {
      (jwt.sign as any).mockReturnValue("token");

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      const payload = callArgs[0];
      expect(typeof payload.iat).toBe("number");
      expect(payload.iat).toBeGreaterThan(0);
    });

    it("should set iat to current Unix timestamp", () => {
      (jwt.sign as any).mockReturnValue("token");

      const beforeCall = Math.floor(Date.now() / 1000);
      signJWT(mockRequest);
      const afterCall = Math.floor(Date.now() / 1000);

      const callArgs = (jwt.sign as any).mock.calls[0];
      const payload = callArgs[0];
      expect(payload.iat).toBeGreaterThanOrEqual(beforeCall);
      expect(payload.iat).toBeLessThanOrEqual(afterCall + 1);
    });

    it("should pass secret to jwt.sign", () => {
      (jwt.sign as any).mockReturnValue("token");

      const customSecret = "my-custom-secret";
      mockRequest.secret = customSecret;

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      expect(callArgs[1]).toBe(customSecret);
    });

    it("should handle single role", () => {
      (jwt.sign as any).mockReturnValue("token");
      mockRequest.payload = {
        id: "user-123",
        roles: ["admin"],
      } as any;

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      const payload = callArgs[0];
      expect(payload.roles).toEqual(["admin"]);
    });

    it("should handle empty roles array", () => {
      (jwt.sign as any).mockReturnValue("token");
      mockRequest.payload = {
        id: "user-123",
        roles: [],
      } as any;

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      const payload = callArgs[0];
      expect(payload.roles).toEqual([]);
    });

    it("should handle multiple roles", () => {
      (jwt.sign as any).mockReturnValue("token");
      mockRequest.payload = {
        id: "user-123",
        roles: ["admin", "user", "moderator", "viewer"],
      } as any;

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      const payload = callArgs[0];
      expect(payload.roles).toEqual(["admin", "user", "moderator", "viewer"]);
    });

    it("should preserve role order", () => {
      (jwt.sign as any).mockReturnValue("token");
      mockRequest.payload = {
        id: "user-123",
        roles: ["viewer", "moderator", "user", "admin"],
      } as any;

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      const payload = callArgs[0];
      expect(payload.roles).toEqual(["viewer", "moderator", "user", "admin"]);
    });

    it("should handle roles with special characters", () => {
      (jwt.sign as any).mockReturnValue("token");
      mockRequest.payload = {
        id: "user-123",
        roles: ["admin:write", "user:read", "role@v1"],
      } as any;

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      const payload = callArgs[0];
      expect(payload.roles).toEqual(["admin:write", "user:read", "role@v1"]);
    });

    it("should handle various user IDs", () => {
      (jwt.sign as any).mockReturnValue("token");

      const userIds = [
        "user-123",
        "12345678-1234-1234-1234-123456789012",
        "admin@example.com",
        "user_with_underscore",
      ];

      for (const userId of userIds) {
        vi.clearAllMocks();
        (jwt.sign as any).mockReturnValue("token");

        mockRequest.payload = {
          id: userId,
          roles: ["admin"],
        } as any;

        signJWT(mockRequest);

        const callArgs = (jwt.sign as any).mock.calls[0];
        const payload = callArgs[0];
        expect(payload.id).toBe(userId);
      }
    });

    it("should log request header", () => {
      (jwt.sign as any).mockReturnValue("token");

      signJWT(mockRequest);

      expect(consoleLogSpy).toHaveBeenCalledWith("=== SignJWT Request ===");
    });

    it("should log payload info", () => {
      (jwt.sign as any).mockReturnValue("token");

      signJWT(mockRequest);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Payload:",
        mockRequest.payload,
      );
      expect(consoleLogSpy).toHaveBeenCalledWith("Payload type:", "object");
    });

    it("should log UserPayload construction message", () => {
      (jwt.sign as any).mockReturnValue("token");

      signJWT(mockRequest);

      expect(consoleLogSpy).toHaveBeenCalledWith("Creating UserPayload...");
    });

    it("should log constructed payload", () => {
      (jwt.sign as any).mockReturnValue("token");

      signJWT(mockRequest);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Payload constructed:",
        expect.objectContaining({
          id: "user-123",
          roles: ["admin", "user"],
          iat: expect.any(Number),
        }),
      );
    });

    it("should log secret length", () => {
      (jwt.sign as any).mockReturnValue("token");

      signJWT(mockRequest);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Signing with secret length:",
        mockRequest.secret.length,
      );
    });

    it("should log token generation success", () => {
      (jwt.sign as any).mockReturnValue("token");

      signJWT(mockRequest);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Token generated successfully",
      );
    });
  });

  describe("payload handling", () => {
    it("should handle missing id in payload", () => {
      (jwt.sign as any).mockReturnValue("token");
      mockRequest.payload = {
        id: undefined,
        roles: ["admin"],
      } as any;

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      const payload = callArgs[0];
      expect(payload.id).toBe("");
    });

    it("should convert null id to empty string", () => {
      (jwt.sign as any).mockReturnValue("token");
      mockRequest.payload = {
        id: null,
        roles: ["admin"],
      } as any;

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      const payload = callArgs[0];
      expect(payload.id).toBe("");
    });

    it("should convert empty string id to empty string", () => {
      (jwt.sign as any).mockReturnValue("token");
      mockRequest.payload = {
        id: "",
        roles: ["admin"],
      } as any;

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      const payload = callArgs[0];
      expect(payload.id).toBe("");
    });

    it("should handle non-array roles by converting to empty array", () => {
      (jwt.sign as any).mockReturnValue("token");
      mockRequest.payload = {
        id: "user-123",
        roles: "admin" as any,
      } as any;

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      const payload = callArgs[0];
      expect(payload.roles).toEqual([]);
    });

    it("should handle null roles by converting to empty array", () => {
      (jwt.sign as any).mockReturnValue("token");
      mockRequest.payload = {
        id: "user-123",
        roles: null,
      } as any;

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      const payload = callArgs[0];
      expect(payload.roles).toEqual([]);
    });

    it("should handle undefined roles by converting to empty array", () => {
      (jwt.sign as any).mockReturnValue("token");
      mockRequest.payload = {
        id: "user-123",
        roles: undefined,
      } as any;

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      const payload = callArgs[0];
      expect(payload.roles).toEqual([]);
    });

    it("should handle object roles by converting to empty array", () => {
      (jwt.sign as any).mockReturnValue("token");
      mockRequest.payload = {
        id: "user-123",
        roles: { admin: true } as any,
      } as any;

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      const payload = callArgs[0];
      expect(payload.roles).toEqual([]);
    });

    it("should handle number roles by converting to empty array", () => {
      (jwt.sign as any).mockReturnValue("token");
      mockRequest.payload = {
        id: "user-123",
        roles: 123 as any,
      } as any;

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      const payload = callArgs[0];
      expect(payload.roles).toEqual([]);
    });
  });

  describe("error handling - missing payload", () => {
    it("should throw AuthError when payload is undefined", () => {
      mockRequest.payload = undefined;

      try {
        signJWT(mockRequest);
        expect.fail("Should have thrown AuthError");
      } catch (error) {
        expect(isAuthError(error)).toBe(true);
        // Outer catch block wraps all errors in SIGNING_ERROR
        expect((error as any).type).toBe("SIGNING_ERROR");
      }
    });

    it("should throw AuthError when payload is null", () => {
      mockRequest.payload = null as any;

      try {
        signJWT(mockRequest);
        expect.fail("Should have thrown AuthError");
      } catch (error) {
        expect(isAuthError(error)).toBe(true);
        // Outer catch block wraps all errors in SIGNING_ERROR
        expect((error as any).type).toBe("SIGNING_ERROR");
      }
    });

    it("should include descriptive message when payload is missing", () => {
      mockRequest.payload = undefined;

      try {
        signJWT(mockRequest);
        expect.fail("Should have thrown AuthError");
      } catch (error) {
        expect((error as any).rawMessage).toContain("Payload is required");
      }
    });

    it("should always throw SIGNING_ERROR from outer catch block", () => {
      mockRequest.payload = undefined;

      try {
        signJWT(mockRequest);
        expect.fail("Should have thrown AuthError");
      } catch (error) {
        expect(isAuthError(error)).toBe(true);
        // All errors from within the try block get wrapped in SIGNING_ERROR
        expect((error as any).type).toBe("SIGNING_ERROR");
      }
    });

    it("should wrap the original error message", () => {
      mockRequest.payload = undefined;

      try {
        signJWT(mockRequest);
        expect.fail("Should have thrown AuthError");
      } catch (error) {
        expect((error as any).rawMessage).toContain("Failed to sign JWT");
      }
    });

    it("should log error when payload is missing", () => {
      mockRequest.payload = undefined;

      try {
        signJWT(mockRequest);
      } catch {
        // Error expected
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith("=== SignJWT Error ===");
    });
  });

  describe("error handling - JWT signing failure", () => {
    it("should catch jwt.sign errors and throw AuthError", () => {
      const signingError = new Error("JWT signing failed");
      (jwt.sign as any).mockImplementation(() => {
        throw signingError;
      });

      try {
        signJWT(mockRequest);
        expect.fail("Should have thrown AuthError");
      } catch (error) {
        expect(isAuthError(error)).toBe(true);
        expect((error as any).type).toBe("SIGNING_ERROR");
      }
    });

    it("should include jwt.sign error message in AuthError", () => {
      const signingError = new Error("Invalid secret");
      (jwt.sign as any).mockImplementation(() => {
        throw signingError;
      });

      try {
        signJWT(mockRequest);
        expect.fail("Should have thrown AuthError");
      } catch (error) {
        expect((error as any).rawMessage).toContain("Invalid secret");
      }
    });

    it("should handle non-Error objects thrown from jwt.sign", () => {
      (jwt.sign as any).mockImplementation(() => {
        throw "string error";
      });

      try {
        signJWT(mockRequest);
        expect.fail("Should have thrown AuthError");
      } catch (error) {
        expect(isAuthError(error)).toBe(true);
        expect((error as any).type).toBe("SIGNING_ERROR");
      }
    });

    it("should log error message from jwt.sign", () => {
      const signingError = new Error("Secret expired");
      (jwt.sign as any).mockImplementation(() => {
        throw signingError;
      });

      try {
        signJWT(mockRequest);
      } catch {
        // Error expected
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Message:",
        expect.stringContaining("Secret expired"),
      );
    });

    it("should log error stack trace", () => {
      const signingError = new Error("JWT signing failed");
      (jwt.sign as any).mockImplementation(() => {
        throw signingError;
      });

      try {
        signJWT(mockRequest);
      } catch {
        // Error expected
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Stack:",
        expect.any(String),
      );
    });
  });

  describe("secret handling", () => {
    it("should accept various secret formats", () => {
      (jwt.sign as any).mockReturnValue("token");

      const secrets = [
        "simple-secret",
        "very-long-secret-with-many-characters-" + "x".repeat(100),
        "secret@123!#$%",
        "中文密钥",
      ];

      for (const secret of secrets) {
        vi.clearAllMocks();
        (jwt.sign as any).mockReturnValue("token");

        mockRequest.secret = secret;
        signJWT(mockRequest);

        const callArgs = (jwt.sign as any).mock.calls[0];
        expect(callArgs[1]).toBe(secret);
      }
    });

    it("should handle empty secret", () => {
      (jwt.sign as any).mockReturnValue("token");
      mockRequest.secret = "";

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      expect(callArgs[1]).toBe("");
    });

    it("should handle very long secret", () => {
      (jwt.sign as any).mockReturnValue("token");
      mockRequest.secret = "s".repeat(10000);

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      expect(callArgs[1].length).toBe(10000);
    });

    it("should log secret length", () => {
      (jwt.sign as any).mockReturnValue("token");
      mockRequest.secret = "secret";

      signJWT(mockRequest);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Signing with secret length:",
        6,
      );
    });
  });

  describe("response format", () => {
    it("should return object with token property", () => {
      (jwt.sign as any).mockReturnValue("test-token");

      const result = signJWT(mockRequest);

      expect(result).toHaveProperty("token");
      expect(result.token).toBe("test-token");
    });

    it("should return only token property", () => {
      (jwt.sign as any).mockReturnValue("test-token");

      const result = signJWT(mockRequest);

      expect(Object.keys(result)).toEqual(["token"]);
    });

    it("should return different tokens for different calls", () => {
      (jwt.sign as any)
        .mockReturnValueOnce("token1")
        .mockReturnValueOnce("token2");

      const result1 = signJWT(mockRequest);
      const result2 = signJWT(mockRequest);

      expect(result1.token).toBe("token1");
      expect(result2.token).toBe("token2");
    });
  });

  describe("timestamp handling", () => {
    it("should create Unix timestamp for iat", () => {
      (jwt.sign as any).mockReturnValue("token");

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      const payload = callArgs[0];

      // Unix timestamp should be a large number (seconds since epoch)
      expect(payload.iat).toBeGreaterThan(1600000000); // After Sept 2020
      expect(payload.iat).toBeLessThan(2000000000); // Before Sept 2033
    });

    it("should use toUnixInteger() for consistent timestamp", () => {
      (jwt.sign as any).mockReturnValue("token");

      const beforeTime = Math.floor(Date.now() / 1000);
      signJWT(mockRequest);
      const afterTime = Math.floor(Date.now() / 1000);

      const callArgs = (jwt.sign as any).mock.calls[0];
      const payload = callArgs[0];

      expect(payload.iat).toBeGreaterThanOrEqual(beforeTime);
      expect(payload.iat).toBeLessThanOrEqual(afterTime + 1);
    });

    it("should generate different timestamps for sequential calls", async () => {
      (jwt.sign as any).mockReturnValue("token");

      signJWT(mockRequest);
      const timestamp1 = (jwt.sign as any).mock.calls[0][0].iat;

      // Wait a bit to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 1001));

      signJWT(mockRequest);
      const timestamp2 = (jwt.sign as any).mock.calls[1][0].iat;

      expect(timestamp2).toBeGreaterThanOrEqual(timestamp1);
    });
  });

  describe("edge cases", () => {
    it("should handle very long user ID", () => {
      (jwt.sign as any).mockReturnValue("token");
      mockRequest.payload = {
        id: "a".repeat(1000),
        roles: ["admin"],
      } as any;

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      const payload = callArgs[0];
      expect(payload.id.length).toBe(1000);
    });

    it("should handle very large roles array", () => {
      (jwt.sign as any).mockReturnValue("token");
      const largeRolesArray = Array.from(
        { length: 1000 },
        (_, i) => `role-${i}`,
      );
      mockRequest.payload = {
        id: "user-123",
        roles: largeRolesArray,
      } as any;

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      const payload = callArgs[0];
      expect(payload.roles).toHaveLength(1000);
    });

    it("should handle duplicate roles", () => {
      (jwt.sign as any).mockReturnValue("token");
      mockRequest.payload = {
        id: "user-123",
        roles: ["admin", "admin", "user", "user"],
      } as any;

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      const payload = callArgs[0];
      // Should preserve duplicates as-is
      expect(payload.roles).toEqual(["admin", "admin", "user", "user"]);
    });

    it("should handle roles with empty strings", () => {
      (jwt.sign as any).mockReturnValue("token");
      mockRequest.payload = {
        id: "user-123",
        roles: ["", "admin", ""],
      } as any;

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      const payload = callArgs[0];
      expect(payload.roles).toEqual(["", "admin", ""]);
    });

    it("should handle unicode characters in id", () => {
      (jwt.sign as any).mockReturnValue("token");
      mockRequest.payload = {
        id: "user_用户_пользователь",
        roles: ["admin"],
      } as any;

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      const payload = callArgs[0];
      expect(payload.id).toBe("user_用户_пользователь");
    });

    it("should handle unicode characters in roles", () => {
      (jwt.sign as any).mockReturnValue("token");
      mockRequest.payload = {
        id: "user-123",
        roles: ["管理员", "пользователь", "admin"],
      } as any;

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      const payload = callArgs[0];
      expect(payload.roles).toEqual(["管理员", "пользователь", "admin"]);
    });

    it("should be synchronous (not return a promise)", () => {
      (jwt.sign as any).mockReturnValue("token");

      const result = signJWT(mockRequest);

      expect(result).not.toBeInstanceOf(Promise);
      expect(result).toHaveProperty("token");
    });
  });

  describe("jwt.sign integration", () => {
    it("should call jwt.sign exactly once per request", () => {
      (jwt.sign as any).mockReturnValue("token");

      signJWT(mockRequest);

      expect(jwt.sign).toHaveBeenCalledTimes(1);
    });

    it("should pass payload as first argument to jwt.sign", () => {
      (jwt.sign as any).mockReturnValue("token");

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      expect(callArgs[0]).toEqual(
        expect.objectContaining({
          id: "user-123",
          roles: ["admin", "user"],
          iat: expect.any(Number),
        }),
      );
    });

    it("should pass secret as second argument to jwt.sign", () => {
      (jwt.sign as any).mockReturnValue("token");

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      expect(callArgs[1]).toBe("test-secret-key");
    });

    it("should pass options with HS256 algorithm as third argument", () => {
      (jwt.sign as any).mockReturnValue("token");

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      expect(callArgs[2]).toEqual({ algorithm: "HS256" });
    });

    it("should use correct function signature for jwt.sign", () => {
      (jwt.sign as any).mockReturnValue("token");

      signJWT(mockRequest);

      const callArgs = (jwt.sign as any).mock.calls[0];
      // Should have exactly 3 arguments: payload, secret, options
      expect(callArgs).toHaveLength(3);
    });
  });

  describe("multiple sequential calls", () => {
    it("should handle multiple sequential requests", () => {
      (jwt.sign as any).mockReturnValue("token");

      const requests = [
        {
          payload: { id: "user-1", roles: ["admin"] } as any,
          secret: "secret-1",
        } as SignJWTRequest,
        {
          payload: { id: "user-2", roles: ["user"] } as any,
          secret: "secret-2",
        } as SignJWTRequest,
        {
          payload: { id: "user-3", roles: [] } as any,
          secret: "secret-3",
        } as SignJWTRequest,
      ];

      for (const req of requests) {
        signJWT(req);
      }

      expect(jwt.sign).toHaveBeenCalledTimes(3);
    });

    it("should generate consistent results for identical inputs", () => {
      const token1 = "token1";
      const token2 = "token2";
      (jwt.sign as any).mockReturnValueOnce(token1).mockReturnValueOnce(token2);

      const result1 = signJWT(mockRequest);
      const result2 = signJWT(mockRequest);

      expect(result1.token).toBe(token1);
      expect(result2.token).toBe(token2);
    });
  });
});
