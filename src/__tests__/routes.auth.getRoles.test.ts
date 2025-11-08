import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getRoles } from "../routes/auth/getRoles";
import { AuthError } from "../errors/auth";
import { userContextKey } from "../context/auth";
import { isAuthError } from "./helpers/error";
import type { UserPayload } from "../types/auth";
import type { GetRolesRequest } from "../gen/auth/v1/auth_pb";
import type { HandlerContext } from "@connectrpc/connect";

describe("getRoles", () => {
  let mockRequest: GetRolesRequest;
  let mockContext: HandlerContext;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockRequest = {
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature",
    } as GetRolesRequest;

    mockContext = {
      values: new Map(),
    } as HandlerContext;
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("successful role extraction", () => {
    it("should extract roles from context payload", () => {
      const userPayload: UserPayload = {
        id: "user-123",
        roles: ["admin", "user"],
        iat: 1234567890,
      };

      mockContext.values.set(userContextKey, userPayload);

      const result = getRoles(mockRequest, mockContext);

      expect(result.roles).toEqual(["admin", "user"]);
    });

    it("should return empty array when roles is empty", () => {
      const userPayload: UserPayload = {
        id: "user-123",
        roles: [],
        iat: 1234567890,
      };

      mockContext.values.set(userContextKey, userPayload);

      const result = getRoles(mockRequest, mockContext);

      expect(result.roles).toEqual([]);
    });

    it("should handle single role", () => {
      const userPayload: UserPayload = {
        id: "user-123",
        roles: ["admin"],
        iat: 1234567890,
      };

      mockContext.values.set(userContextKey, userPayload);

      const result = getRoles(mockRequest, mockContext);

      expect(result.roles).toEqual(["admin"]);
    });

    it("should handle multiple roles", () => {
      const userPayload: UserPayload = {
        id: "user-123",
        roles: ["admin", "user", "moderator", "viewer"],
        iat: 1234567890,
      };

      mockContext.values.set(userContextKey, userPayload);

      const result = getRoles(mockRequest, mockContext);

      expect(result.roles).toEqual(["admin", "user", "moderator", "viewer"]);
    });

    it("should preserve role order", () => {
      const userPayload: UserPayload = {
        id: "user-123",
        roles: ["viewer", "moderator", "user", "admin"],
        iat: 1234567890,
      };

      mockContext.values.set(userContextKey, userPayload);

      const result = getRoles(mockRequest, mockContext);

      expect(result.roles).toEqual(["viewer", "moderator", "user", "admin"]);
    });

    it("should handle roles with special characters", () => {
      const userPayload: UserPayload = {
        id: "user-123",
        roles: ["admin:write", "user:read", "moderator@v1", "viewer#read"],
        iat: 1234567890,
      };

      mockContext.values.set(userContextKey, userPayload);

      const result = getRoles(mockRequest, mockContext);

      expect(result.roles).toEqual([
        "admin:write",
        "user:read",
        "moderator@v1",
        "viewer#read",
      ]);
    });

    it("should handle roles with unicode characters", () => {
      const userPayload: UserPayload = {
        id: "user-123",
        roles: ["admin", "用户", "管理员"],
        iat: 1234567890,
      };

      mockContext.values.set(userContextKey, userPayload);

      const result = getRoles(mockRequest, mockContext);

      expect(result.roles).toEqual(["admin", "用户", "管理员"]);
    });

    it("should log request token prefix", () => {
      const userPayload: UserPayload = {
        id: "user-123",
        roles: ["admin"],
        iat: 1234567890,
      };

      mockContext.values.set(userContextKey, userPayload);

      getRoles(mockRequest, mockContext);

      expect(consoleLogSpy).toHaveBeenCalledWith("=== GetRoles Request ===");
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Token:",
        expect.stringContaining("..."),
      );
    });

    it("should log extracted roles", () => {
      const userPayload: UserPayload = {
        id: "user-123",
        roles: ["admin", "user"],
        iat: 1234567890,
      };

      mockContext.values.set(userContextKey, userPayload);

      getRoles(mockRequest, mockContext);

      expect(consoleLogSpy).toHaveBeenCalledWith("Extracted roles:", [
        "admin",
        "user",
      ]);
    });
  });

  describe("error handling - missing payload", () => {
    it("should throw AuthError when payload is not in context", () => {
      try {
        getRoles(mockRequest, mockContext);
        expect.fail("Should have thrown AuthError");
      } catch (error) {
        expect(isAuthError(error)).toBe(true);
        expect((error as any).type).toBe("INVALID_PAYLOAD");
      }
    });

    it("should throw AuthError when payload is null", () => {
      mockContext.values.set(userContextKey, null);

      try {
        getRoles(mockRequest, mockContext);
        expect.fail("Should have thrown AuthError");
      } catch (error) {
        expect(isAuthError(error)).toBe(true);
        expect((error as any).type).toBe("INVALID_PAYLOAD");
      }
    });

    it("should throw AuthError when payload is undefined", () => {
      mockContext.values.set(userContextKey, undefined);

      try {
        getRoles(mockRequest, mockContext);
        expect.fail("Should have thrown AuthError");
      } catch (error) {
        expect(isAuthError(error)).toBe(true);
        expect((error as any).type).toBe("INVALID_PAYLOAD");
      }
    });

    it("should include descriptive error message when payload is missing", () => {
      try {
        getRoles(mockRequest, mockContext);
        expect.fail("Should have thrown AuthError");
      } catch (error) {
        expect((error as any).rawMessage).toContain(
          "Failed to extract roles from JWT",
        );
      }
    });

    it("should log error when payload is missing", () => {
      try {
        getRoles(mockRequest, mockContext);
      } catch {
        // Error expected
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith("=== GetRoles Error ===");
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("should handle payload with missing roles property", () => {
      const userPayload = {
        id: "user-123",
        iat: 1234567890,
      } as any;

      mockContext.values.set(userContextKey, userPayload);

      const result = getRoles(mockRequest, mockContext);

      expect(result.roles).toEqual([]);
    });

    it("should handle payload with null roles", () => {
      const userPayload = {
        id: "user-123",
        roles: null,
        iat: 1234567890,
      } as any;

      mockContext.values.set(userContextKey, userPayload);

      const result = getRoles(mockRequest, mockContext);

      expect(result.roles).toEqual([]);
    });

    it("should handle payload with undefined roles", () => {
      const userPayload = {
        id: "user-123",
        roles: undefined,
        iat: 1234567890,
      } as any;

      mockContext.values.set(userContextKey, userPayload);

      const result = getRoles(mockRequest, mockContext);

      expect(result.roles).toEqual([]);
    });

    it("should handle very long token", () => {
      const longToken = "a".repeat(10000);
      mockRequest.token = longToken;

      const userPayload: UserPayload = {
        id: "user-123",
        roles: ["admin"],
        iat: 1234567890,
      };

      mockContext.values.set(userContextKey, userPayload);

      const result = getRoles(mockRequest, mockContext);

      expect(result.roles).toEqual(["admin"]);
    });

    it("should handle empty token string", () => {
      mockRequest.token = "";

      const userPayload: UserPayload = {
        id: "user-123",
        roles: ["admin"],
        iat: 1234567890,
      };

      mockContext.values.set(userContextKey, userPayload);

      const result = getRoles(mockRequest, mockContext);

      expect(result.roles).toEqual(["admin"]);
    });

    it("should handle different user IDs", () => {
      const userIds = [
        "user-123",
        "12345678-1234-1234-1234-123456789012",
        "admin@example.com",
      ];

      for (const userId of userIds) {
        mockContext.values.clear();

        const userPayload: UserPayload = {
          id: userId,
          roles: ["admin"],
          iat: 1234567890,
        };

        mockContext.values.set(userContextKey, userPayload);

        const result = getRoles(mockRequest, mockContext);

        expect(result.roles).toEqual(["admin"]);
      }
    });

    it("should handle different timestamps", () => {
      const timestamps = [0, 1234567890, 9999999999, Date.now()];

      for (const timestamp of timestamps) {
        mockContext.values.clear();

        const userPayload: UserPayload = {
          id: "user-123",
          roles: ["admin"],
          iat: timestamp,
        };

        mockContext.values.set(userContextKey, userPayload);

        const result = getRoles(mockRequest, mockContext);

        expect(result.roles).toEqual(["admin"]);
      }
    });

    it("should handle roles array with whitespace", () => {
      const userPayload: UserPayload = {
        id: "user-123",
        roles: [" admin", "user ", " moderator "],
        iat: 1234567890,
      };

      mockContext.values.set(userContextKey, userPayload);

      const result = getRoles(mockRequest, mockContext);

      // Should preserve whitespace as-is
      expect(result.roles).toEqual([" admin", "user ", " moderator "]);
    });

    it("should handle roles with empty strings", () => {
      const userPayload: UserPayload = {
        id: "user-123",
        roles: ["", "admin", ""],
        iat: 1234567890,
      };

      mockContext.values.set(userContextKey, userPayload);

      const result = getRoles(mockRequest, mockContext);

      expect(result.roles).toEqual(["", "admin", ""]);
    });

    it("should handle very long role names", () => {
      const longRoleName = "a".repeat(1000);
      const userPayload: UserPayload = {
        id: "user-123",
        roles: [longRoleName, "admin"],
        iat: 1234567890,
      };

      mockContext.values.set(userContextKey, userPayload);

      const result = getRoles(mockRequest, mockContext);

      expect(result.roles).toEqual([longRoleName, "admin"]);
    });
  });

  describe("response format", () => {
    it("should return object with roles property", () => {
      const userPayload: UserPayload = {
        id: "user-123",
        roles: ["admin"],
        iat: 1234567890,
      };

      mockContext.values.set(userContextKey, userPayload);

      const result = getRoles(mockRequest, mockContext);

      expect(result).toHaveProperty("roles");
      expect(Array.isArray(result.roles)).toBe(true);
    });

    it("should return response with only roles property", () => {
      const userPayload: UserPayload = {
        id: "user-123",
        roles: ["admin", "user"],
        iat: 1234567890,
      };

      mockContext.values.set(userContextKey, userPayload);

      const result = getRoles(mockRequest, mockContext);

      expect(Object.keys(result)).toEqual(["roles"]);
    });

    it("should return consistent roles array across calls", () => {
      const userPayload: UserPayload = {
        id: "user-123",
        roles: ["admin", "user"],
        iat: 1234567890,
      };

      mockContext.values.set(userContextKey, userPayload);

      const result1 = getRoles(mockRequest, mockContext);
      const result2 = getRoles(mockRequest, mockContext);

      expect(result1.roles).toEqual(result2.roles);
    });
  });

  describe("error wrapping", () => {
    it("should wrap missing payload error with context message", () => {
      try {
        getRoles(mockRequest, mockContext);
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as any).rawMessage).toContain(
          "Failed to extract roles from JWT",
        );
      }
    });

    it("should be an AuthError instance", () => {
      try {
        getRoles(mockRequest, mockContext);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(isAuthError(error)).toBe(true);
      }
    });

    it("should have INVALID_PAYLOAD type for missing context", () => {
      try {
        getRoles(mockRequest, mockContext);
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as any).type).toBe("INVALID_PAYLOAD");
      }
    });
  });
});
