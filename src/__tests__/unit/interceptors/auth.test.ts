import { describe, it, expect, vi, beforeEach } from "vitest";
import { authInterceptor, no_auth } from "../../../interceptors/auth";
import * as dbModule from "../../../storage/db/postgres/db";
import * as hashModule from "../../../utils/hashAPIKey";

describe("authInterceptor", () => {
  const makeReq = (auth?: string) => ({
    url: "https://api.example.com/protected_endpoint",
    header: auth
      ? new Map<string, string>([["Authorization", auth]])
      : new Map<string, string>(),
    contextValues: new Map(),
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock DB to return valid API key record
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        {
          id: "test-api-key-id",
          expiresAt: new Date(Date.now() + 86400000).toISOString(), // expires tomorrow
          revoked: false,
        },
      ]),
    };

    vi.spyOn(dbModule, "getPostgresDB").mockReturnValue({
      ...mockDb,
    } as any);
    vi.spyOn(hashModule, "hashAPIKey").mockReturnValue("mocked-hash");
  });

  it("Ignores no_auth endpoints", async () => {
    const next = vi.fn().mockResolvedValue("next called");
    const req = {
      url: "https://api.example.com/no_auth_endpoint",
      header: new Map<string, string>(),
    };

    // Mock no_auth to include the test endpoint
    no_auth.length = 0;
    no_auth.push("no_auth_endpoint");

    const interceptor = authInterceptor();
    const result = await interceptor(next)(req as any);

    expect(result).toBe("next called");
    expect(next).toHaveBeenCalledWith(req);
  });

  it("Validates Authorization header cases", async () => {
    const next = vi.fn().mockResolvedValue("next called");
    const interceptor = authInterceptor();

    // Empty Authorization should be rejected
    await expect(interceptor(next)(makeReq() as any)).rejects.toThrow(
      "Missing Authorization header"
    );

    // Authorization that does not start with Bearer should be rejected
    await expect(
      interceptor(next)(makeReq("Token abcdef") as any)
    ).rejects.toThrow(
      'Authorization header must be in format "Bearer <api_key>"'
    );

    // Authorization with invalid API key format (not starting with scrn_) should be rejected
    await expect(
      interceptor(next)(makeReq("Bearer " + "a".repeat(37)) as any)
    ).rejects.toThrow("Invalid API key: Invalid API key format");

    // Authorization with invalid API key format (wrong length) should be rejected
    await expect(
      interceptor(next)(makeReq("Bearer scrn_short") as any)
    ).rejects.toThrow("Invalid API key: Invalid API key format");
  });

  it("Sets the context values", async () => {
    const next = vi.fn().mockResolvedValue("next called");
    const interceptor = authInterceptor();

    const validApiKey = "Bearer scrn_" + "a".repeat(32);
    const req = makeReq(validApiKey);
    const result = await interceptor(next)(req as any);

    expect(result).toBe("next called");
    expect(next).toHaveBeenCalledWith(req);
    const apiKeyId = Array.from(req.contextValues.values())[0];
    expect(apiKeyId).toBe("test-api-key-id");
  });
});
