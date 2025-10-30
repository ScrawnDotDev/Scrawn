import { describe, it, expect, beforeEach, vi } from "vitest";
import { signJWT } from "../routes/auth/signJWT";

vi.mock("jsonwebtoken", () => ({
  default: {
    sign: vi.fn(),
  },
}));

import jwt from "jsonwebtoken";

describe("signJWT", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createRequest = (
    id = "12345678-1234-1234-1234-123456789012",
    roles = ["admin"],
    secret = "test-secret",
  ) => ({
    payload: { id, roles },
    secret,
  });

  describe("successful JWT signing", () => {
    it("should sign JWT with valid payload and return token", () => {
      const mockToken =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature";
      (jwt.sign as any).mockReturnValue(mockToken);

      const testCases = [
        { id: "id-1", roles: ["admin", "user"] },
        { id: "id-2", roles: ["admin"] },
        { id: "id-3", roles: [] },
        { id: "id-4", roles: ["admin:write", "user:read"] },
      ];

      testCases.forEach(({ id, roles }) => {
        vi.clearAllMocks();
        (jwt.sign as any).mockReturnValue(mockToken);

        const result = signJWT(createRequest(id, roles) as any);

        expect(result.token).toBe(mockToken);
        expect(jwt.sign).toHaveBeenCalled();

        const callArgs = (jwt.sign as any).mock.calls[0];
        const payload = callArgs[0];

        expect(payload.id).toBe(id);
        expect(payload.roles).toEqual(roles);
        expect(payload.iat).toBeDefined();
        expect(typeof payload.iat).toBe("number");
        expect(callArgs[2].algorithm).toBe("HS256");
      });
    });

    it("should use correct secret for signing", () => {
      const mockToken = "token";
      (jwt.sign as any).mockReturnValue(mockToken);

      const secret = "my-secret-key-12345";
      signJWT(createRequest("id", ["admin"], secret) as any);

      const callArgs = (jwt.sign as any).mock.calls[0];
      expect(callArgs[1]).toBe(secret);
    });
  });

  describe("error handling", () => {
    it("should throw error when payload is missing or undefined", () => {
      const testCases = [
        { payload: null, secret: "secret" },
        { payload: undefined, secret: "secret" },
      ];

      testCases.forEach((req) => {
        expect(() => {
          signJWT(req as any);
        }).toThrow();
      });
    });

    it("should throw error when jwt.sign fails", () => {
      (jwt.sign as any).mockImplementation(() => {
        throw new Error("JWT signing failed");
      });

      expect(() => {
        signJWT(createRequest() as any);
      }).toThrow();
    });

    it("should throw error on non-Error exceptions", () => {
      (jwt.sign as any).mockImplementation(() => {
        throw "Some string error";
      });

      expect(() => {
        signJWT(createRequest() as any);
      }).toThrow();
    });
  });

  describe("edge cases", () => {
    it("should handle long IDs and secret keys", () => {
      const mockToken = "token";
      (jwt.sign as any).mockReturnValue(mockToken);

      const longId = "x".repeat(1000);
      const longSecret = "y".repeat(1000);

      const result = signJWT(
        createRequest(longId, ["admin"], longSecret) as any,
      );

      expect(result.token).toBe(mockToken);

      const callArgs = (jwt.sign as any).mock.calls[0];
      expect(callArgs[0].id).toBe(longId);
      expect(callArgs[1]).toBe(longSecret);
    });

    it("should handle many roles", () => {
      const mockToken = "token";
      (jwt.sign as any).mockReturnValue(mockToken);

      const manyRoles = Array.from({ length: 100 }, (_, i) => `role-${i}`);

      signJWT(createRequest("id", manyRoles) as any);

      const callArgs = (jwt.sign as any).mock.calls[0];
      expect(callArgs[0].roles).toEqual(manyRoles);
    });
  });
});
