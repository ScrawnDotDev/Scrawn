import { describe, it, expect, beforeEach, vi } from "vitest";
import { authInterceptor } from "../interceptors/auth";
import { AuthError, AuthErrorType } from "../errors/auth";
import { userContextKey } from "../context/auth";
import type { UnaryRequest } from "@connectrpc/connect";
import jwt, { TokenExpiredError, JsonWebTokenError } from "jsonwebtoken";

vi.mock("../errors/logger", () => ({
  logger: {
    logError: vi.fn(),
  },
}));

describe("authInterceptor", () => {
  let mockRequest: Partial<UnaryRequest>;
  const secret = "test-secret-key";
  const interceptor = authInterceptor(secret);

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = {
      url: "/auth.v1.AuthService/GetRoles",
      header: new Map() as any,
      contextValues: new Map() as any,
    };
  });

  describe("unauthenticated endpoints", () => {
    it("should skip authentication for SignJWT endpoint", async () => {
      (mockRequest as any).url = "/auth.v1.AuthService/SignJWT";
      const nextMock = vi.fn().mockResolvedValue({ status: "ok" });

      const wrapped = interceptor(nextMock);
      const result = await wrapped(mockRequest as UnaryRequest);

      expect(nextMock).toHaveBeenCalledWith(mockRequest);
      expect(result).toEqual({ status: "ok" });
    });

    it("should call next handler for unauthenticated endpoints", async () => {
      (mockRequest as any).url = "/auth.v1.AuthService/SignJWT";
      const nextMock = vi.fn().mockResolvedValue({ response: "data" });

      const wrapped = interceptor(nextMock);
      await wrapped(mockRequest as UnaryRequest);

      expect(nextMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("authentication header validation", () => {
    beforeEach(() => {
      (mockRequest as any).url = "/auth.v1.AuthService/GetRoles";
    });

    it("should throw error when Authorization header is missing", async () => {
      const nextMock = vi.fn();
      const wrapped = interceptor(nextMock);

      await expect(wrapped(mockRequest as UnaryRequest)).rejects.toMatchObject({
        type: AuthErrorType.MISSING_HEADER,
      });
    });

    it("should throw error when Authorization header format is invalid", async () => {
      mockRequest.header!.set("Authorization", "InvalidFormat token");
      const nextMock = vi.fn();
      const wrapped = interceptor(nextMock);

      await expect(wrapped(mockRequest as UnaryRequest)).rejects.toMatchObject({
        type: AuthErrorType.INVALID_HEADER_FORMAT,
      });
    });

    it("should throw error when Authorization header uses wrong prefix", async () => {
      mockRequest.header!.set("Authorization", "Basic dXNlcjpwYXNz");
      const nextMock = vi.fn();
      const wrapped = interceptor(nextMock);

      await expect(wrapped(mockRequest as UnaryRequest)).rejects.toMatchObject({
        type: AuthErrorType.INVALID_HEADER_FORMAT,
      });
    });

    it("should extract token from Bearer header", async () => {
      const validToken =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMzQ1Njc4LTEyMzQtMTIzNC0xMjM0LTEyMzQ1Njc4OTAxMiIsInJvbGVzIjpbImFkbWluIl0sImlhdCI6MTY4ODEzMjgwMH0.signature";
      mockRequest.header!.set("Authorization", `Bearer ${validToken}`);

      const decodedPayload = {
        id: "12345678-1234-1234-1234-123456789012",
        roles: ["admin"],
        iat: 1688132800,
      };

      vi.spyOn(jwt, "verify").mockReturnValue(decodedPayload as any);
      const nextMock = vi.fn().mockResolvedValue({ status: "ok" });

      const wrapped = interceptor(nextMock);
      await wrapped(mockRequest as UnaryRequest);

      expect(jwt.verify).toHaveBeenCalledWith(validToken, secret);
    });
  });

  describe("JWT verification", () => {
    beforeEach(() => {
      (mockRequest as any).url = "/auth.v1.AuthService/GetRoles";
      mockRequest.header!.set("Authorization", "Bearer valid-token");
    });

    it("should throw error when token is expired", async () => {
      const expiredError = new TokenExpiredError("jwt expired", new Date());
      (vi.spyOn(jwt, "verify") as any).mockImplementation(() => {
        throw expiredError;
      });

      const nextMock = vi.fn();
      const wrapped = interceptor(nextMock);

      await expect(wrapped(mockRequest as UnaryRequest)).rejects.toMatchObject({
        type: AuthErrorType.EXPIRED_TOKEN,
      });
    });

    it("should throw error when token is invalid", async () => {
      const jwtError = new JsonWebTokenError("invalid token");
      (vi.spyOn(jwt, "verify") as any).mockImplementation(() => {
        throw jwtError;
      });

      const nextMock = vi.fn();
      const wrapped = interceptor(nextMock);

      await expect(wrapped(mockRequest as UnaryRequest)).rejects.toMatchObject({
        type: AuthErrorType.INVALID_TOKEN,
      });
    });

    it("should verify token with correct secret", async () => {
      const decodedPayload = {
        id: "12345678-1234-1234-1234-123456789012",
        roles: ["admin"],
        iat: 1688132800,
      };

      vi.spyOn(jwt, "verify").mockReturnValue(decodedPayload as any);
      const nextMock = vi.fn().mockResolvedValue({ status: "ok" });

      const wrapped = interceptor(nextMock);
      await wrapped(mockRequest as UnaryRequest);

      expect(jwt.verify).toHaveBeenCalledWith("valid-token", secret);
    });
  });

  describe("payload validation", () => {
    beforeEach(() => {
      (mockRequest as any).url = "/auth.v1.AuthService/GetRoles";
      mockRequest.header!.set("Authorization", "Bearer valid-token");
    });

    it("should throw error when payload schema is invalid", async () => {
      const invalidPayload = {
        id: "not-a-uuid",
        iat: 1688132800,
      };

      vi.spyOn(jwt, "verify").mockReturnValue(invalidPayload as any);
      const nextMock = vi.fn();
      const wrapped = interceptor(nextMock);

      await expect(wrapped(mockRequest as UnaryRequest)).rejects.toMatchObject({
        type: AuthErrorType.MALFORMED_PAYLOAD,
      });
    });

    it("should throw error when payload is missing id", async () => {
      const invalidPayload = {
        roles: ["admin"],
        iat: 1688132800,
      };

      vi.spyOn(jwt, "verify").mockReturnValue(invalidPayload as any);
      const nextMock = vi.fn();
      const wrapped = interceptor(nextMock);

      await expect(wrapped(mockRequest as UnaryRequest)).rejects.toMatchObject({
        type: AuthErrorType.MALFORMED_PAYLOAD,
      });
    });

    it("should throw error when payload is missing roles", async () => {
      const invalidPayload = {
        id: "12345678-1234-1234-1234-123456789012",
        iat: 1688132800,
      };

      vi.spyOn(jwt, "verify").mockReturnValue(invalidPayload as any);
      const nextMock = vi.fn();
      const wrapped = interceptor(nextMock);

      await expect(wrapped(mockRequest as UnaryRequest)).rejects.toMatchObject({
        type: AuthErrorType.MALFORMED_PAYLOAD,
      });
    });

    it("should throw error when payload is missing iat", async () => {
      const invalidPayload = {
        id: "12345678-1234-1234-1234-123456789012",
        roles: ["admin"],
      };

      vi.spyOn(jwt, "verify").mockReturnValue(invalidPayload as any);
      const nextMock = vi.fn();
      const wrapped = interceptor(nextMock);

      await expect(wrapped(mockRequest as UnaryRequest)).rejects.toMatchObject({
        type: AuthErrorType.MALFORMED_PAYLOAD,
      });
    });

    it("should throw error when roles is not an array", async () => {
      const invalidPayload = {
        id: "12345678-1234-1234-1234-123456789012",
        roles: "admin",
        iat: 1688132800,
      };

      vi.spyOn(jwt, "verify").mockReturnValue(invalidPayload as any);
      const nextMock = vi.fn();
      const wrapped = interceptor(nextMock);

      await expect(wrapped(mockRequest as UnaryRequest)).rejects.toMatchObject({
        type: AuthErrorType.MALFORMED_PAYLOAD,
      });
    });

    it("should throw error when iat is not a number", async () => {
      const invalidPayload = {
        id: "12345678-1234-1234-1234-123456789012",
        roles: ["admin"],
        iat: "1688132800",
      };

      vi.spyOn(jwt, "verify").mockReturnValue(invalidPayload as any);
      const nextMock = vi.fn();
      const wrapped = interceptor(nextMock);

      await expect(wrapped(mockRequest as UnaryRequest)).rejects.toMatchObject({
        type: AuthErrorType.MALFORMED_PAYLOAD,
      });
    });
  });

  describe("context attachment", () => {
    beforeEach(() => {
      (mockRequest as any).url = "/auth.v1.AuthService/GetRoles";
      mockRequest.header!.set("Authorization", "Bearer valid-token");
    });

    it("should attach user payload to context", async () => {
      const decodedPayload = {
        id: "12345678-1234-1234-1234-123456789012",
        roles: ["admin", "user"],
        iat: 1688132800,
      };

      vi.spyOn(jwt, "verify").mockReturnValue(decodedPayload as any);
      const nextMock = vi.fn().mockResolvedValue({ status: "ok" });

      const wrapped = interceptor(nextMock);
      await wrapped(mockRequest as UnaryRequest);

      expect(mockRequest.contextValues!.get(userContextKey)).toEqual(
        decodedPayload,
      );
    });

    it("should pass modified request to next handler", async () => {
      const decodedPayload = {
        id: "12345678-1234-1234-1234-123456789012",
        roles: ["admin"],
        iat: 1688132800,
      };

      vi.spyOn(jwt, "verify").mockReturnValue(decodedPayload as any);
      const nextMock = vi.fn().mockResolvedValue({ status: "ok" });

      const wrapped = interceptor(nextMock);
      await wrapped(mockRequest as UnaryRequest);

      expect(nextMock).toHaveBeenCalledWith(mockRequest);
      expect(nextMock).toHaveBeenCalledTimes(1);
    });

    it("should return response from next handler", async () => {
      const decodedPayload = {
        id: "12345678-1234-1234-1234-123456789012",
        roles: ["admin"],
        iat: 1688132800,
      };

      const expectedResponse = { roles: ["admin"], status: "success" };
      vi.spyOn(jwt, "verify").mockReturnValue(decodedPayload as any);
      const nextMock = vi.fn().mockResolvedValue(expectedResponse);

      const wrapped = interceptor(nextMock);
      const result = await wrapped(mockRequest as UnaryRequest);

      expect(result).toEqual(expectedResponse);
    });
  });

  describe("multiple role handling", () => {
    beforeEach(() => {
      (mockRequest as any).url = "/auth.v1.AuthService/GetRoles";
      mockRequest.header!.set("Authorization", "Bearer valid-token");
    });

    it("should handle payload with multiple roles", async () => {
      const decodedPayload = {
        id: "12345678-1234-1234-1234-123456789012",
        roles: ["admin", "moderator", "user"],
        iat: 1688132800,
      };

      vi.spyOn(jwt, "verify").mockReturnValue(decodedPayload as any);
      const nextMock = vi.fn().mockResolvedValue({ status: "ok" });

      const wrapped = interceptor(nextMock);
      await wrapped(mockRequest as UnaryRequest);

      const storedPayload = mockRequest.contextValues!.get(userContextKey);
      expect(storedPayload?.roles).toEqual(["admin", "moderator", "user"]);
    });

    it("should handle payload with empty roles array", async () => {
      const decodedPayload = {
        id: "12345678-1234-1234-1234-123456789012",
        roles: [],
        iat: 1688132800,
      };

      vi.spyOn(jwt, "verify").mockReturnValue(decodedPayload as any);
      const nextMock = vi.fn().mockResolvedValue({ status: "ok" });

      const wrapped = interceptor(nextMock);
      await wrapped(mockRequest as UnaryRequest);

      const storedPayload = mockRequest.contextValues!.get(userContextKey);
      expect(storedPayload?.roles).toEqual([]);
    });
  });

  describe("different secret handling", () => {
    it("should use different secret for verification", async () => {
      const differentSecret = "different-secret-key";
      const differentInterceptor = authInterceptor(differentSecret);

      (mockRequest as any).url = "/auth.v1.AuthService/GetRoles";
      mockRequest.header!.set("Authorization", "Bearer valid-token");

      const decodedPayload = {
        id: "12345678-1234-1234-1234-123456789012",
        roles: ["admin"],
        iat: 1688132800,
      };

      vi.spyOn(jwt, "verify").mockReturnValue(decodedPayload as any);
      const nextMock = vi.fn().mockResolvedValue({ status: "ok" });

      const wrapped = differentInterceptor(nextMock);
      await wrapped(mockRequest as UnaryRequest);

      expect(jwt.verify).toHaveBeenCalledWith("valid-token", differentSecret);
    });
  });

  describe("error propagation", () => {
    beforeEach(() => {
      (mockRequest as any).url = "/auth.v1.AuthService/GetRoles";
    });

    it("should re-throw AuthError as-is", async () => {
      mockRequest.header!.set("Authorization", "Bearer invalid-token");

      const jwtError = new JsonWebTokenError("invalid token");
      (vi.spyOn(jwt, "verify") as any).mockImplementation(() => {
        throw jwtError;
      });

      const nextMock = vi.fn();
      const wrapped = interceptor(nextMock);

      await expect(wrapped(mockRequest as UnaryRequest)).rejects.toMatchObject({
        type: AuthErrorType.INVALID_TOKEN,
      });
    });

    it("should not call next handler when authentication fails", async () => {
      mockRequest.header!.set("Authorization", "Invalid format");
      const nextMock = vi.fn();

      const wrapped = interceptor(nextMock);

      try {
        await wrapped(mockRequest as UnaryRequest);
      } catch (error) {
        // Expected to throw
      }

      expect(nextMock).not.toHaveBeenCalled();
    });
  });
});
