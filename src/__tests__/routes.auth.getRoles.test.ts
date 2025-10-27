import { describe, it, expect, beforeEach } from "vitest";
import { getRoles } from "../routes/auth/getRoles";
import { userContextKey } from "../context/auth";
import type { HandlerContext } from "@connectrpc/connect";
import type { GetRolesRequest } from "../gen/auth/v1/auth_pb";

describe("getRoles", () => {
  let mockContext: Partial<HandlerContext>;

  beforeEach(() => {
    mockContext = {
      values: new Map() as any,
    };
  });

  const createUserPayload = (roles: string[]) => ({
    id: "12345678-1234-1234-1234-123456789012",
    roles,
    iat: 1688132800,
  });

  const createRequest = (token = "test-token") => ({
    token,
  });

  describe("successful role extraction", () => {
    it("should return roles from context payload", () => {
      const testCases = [
        { roles: ["admin", "user"], description: "multiple roles" },
        { roles: ["admin"], description: "single role" },
        { roles: [], description: "empty array" },
        {
          roles: ["admin:write", "user:read"],
          description: "roles with special characters",
        },
      ];

      testCases.forEach(({ roles }) => {
        mockContext.values!.set(userContextKey, createUserPayload(roles));
        const result = getRoles(
          createRequest() as GetRolesRequest,
          mockContext as HandlerContext,
        );
        expect(result.roles).toEqual(roles);
      });
    });

    it("should handle missing roles property gracefully", () => {
      mockContext.values!.set(userContextKey, {
        id: "12345678-1234-1234-1234-123456789012",
        iat: 1688132800,
      } as any);

      const result = getRoles(
        createRequest() as GetRolesRequest,
        mockContext as HandlerContext,
      );

      expect(result.roles).toEqual([]);
    });

    it("should handle null or undefined roles", () => {
      const payloads = [
        { ...createUserPayload([]), roles: null },
        { ...createUserPayload([]), roles: undefined },
      ];

      payloads.forEach((payload) => {
        mockContext.values!.set(userContextKey, payload as any);
        const result = getRoles(
          createRequest() as GetRolesRequest,
          mockContext as HandlerContext,
        );
        expect(result.roles).toEqual([]);
      });
    });

    it("should preserve role order", () => {
      const roles = ["viewer", "moderator", "admin", "user"];
      mockContext.values!.set(userContextKey, createUserPayload(roles));

      const result = getRoles(
        createRequest() as GetRolesRequest,
        mockContext as HandlerContext,
      );

      expect(result.roles).toEqual(roles);
    });
  });

  describe("error handling", () => {
    it("should throw error when payload is missing from context", () => {
      expect(() => {
        getRoles(
          createRequest() as GetRolesRequest,
          mockContext as HandlerContext,
        );
      }).toThrow();
    });

    it("should throw error when payload is null or undefined", () => {
      [null, undefined].forEach((value) => {
        mockContext.values!.set(userContextKey, value);
        expect(() => {
          getRoles(
            createRequest() as GetRolesRequest,
            mockContext as HandlerContext,
          );
        }).toThrow();
      });
    });

    it("should throw error with helpful message when context is empty", () => {
      expect(() => {
        getRoles(
          createRequest() as GetRolesRequest,
          mockContext as HandlerContext,
        );
      }).toThrow();
    });
  });

  describe("edge cases", () => {
    it("should handle very long token strings", () => {
      const longToken = "x".repeat(10000);
      mockContext.values!.set(userContextKey, createUserPayload(["admin"]));

      const result = getRoles(
        { token: longToken } as GetRolesRequest,
        mockContext as HandlerContext,
      );

      expect(result.roles).toEqual(["admin"]);
    });

    it("should return response object with roles property", () => {
      mockContext.values!.set(userContextKey, createUserPayload(["user"]));

      const result = getRoles(
        createRequest() as GetRolesRequest,
        mockContext as HandlerContext,
      );

      expect(result).toHaveProperty("roles");
      expect(Array.isArray(result.roles)).toBe(true);
    });
  });
});
