import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Metadata } from "@grpc/grpc-js";
import { AuthServiceClient } from "../gen/auth/v1/auth";
import {
  EventServiceClient,
  EventType,
  BasicUsageType,
} from "../gen/event/v1/event";
import {
  GRPC_ADDRESS,
  grpcInsecureCredentials,
  grpcMetadata,
  createAPIKey,
  registerEvent,
} from "./fixtures/grpc";
import { verifyApiKeyCreated } from "./assertions/events";
import { createTestApiKey } from "./fixtures/apiKey";
import { getPostgresDB } from "../storage/db/postgres/db";
import { hashAPIKey } from "../utils/hashAPIKey";
import {
  apiKeysTable,
  webhookEndpointsTable,
} from "../storage/db/postgres/schema";
import { DateTime } from "luxon";
import { clearDatabase } from "./db";
import { verifyBasicUsageEventStored } from "./assertions/events";

function dashboardMetadata(rawKey: string, role?: string): Metadata {
  const meta = grpcMetadata(`Bearer ${rawKey}`);
  if (role) meta.set("x-scrawn-role", role);
  return meta;
}

async function createDashboardApiKey(): Promise<{
  rawKey: string;
  id: string;
}> {
  const db = getPostgresDB();
  const rawKey = `scrn_dash_${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}`;
  const [key] = await db
    .insert(apiKeysTable)
    .values({
      name: `test-dashboard-key-${crypto.randomUUID()}`,
      key: hashAPIKey(rawKey),
      role: "dashboard",
      expiresAt: DateTime.utc().plus({ years: 1 }).toISO(),
    })
    .returning({ id: apiKeysTable.id });
  return { rawKey, id: key!.id };
}

describe("AuthService", () => {
  let authClient: AuthServiceClient;
  let eventClient: EventServiceClient;
  let dashKey: string;
  let testKey: string;

  beforeAll(async () => {
    authClient = new AuthServiceClient(GRPC_ADDRESS, grpcInsecureCredentials);
    eventClient = new EventServiceClient(GRPC_ADDRESS, grpcInsecureCredentials);
    const dash = await createDashboardApiKey();
    dashKey = dash.rawKey;
    const test = await createTestApiKey();
    testKey = test.rawKey;
  });

  afterAll(async () => {
    await clearDatabase();
    authClient.close();
    eventClient.close();
  });

  describe("createAPIKey", () => {
    it("dashboard key creates a test key", async () => {
      const res = await createAPIKey(
        authClient,
        { name: "my-test-key", expiresIn: 3600 },
        dashboardMetadata(dashKey, "test")
      );

      expect(res.apiKeyId).toBeTruthy();
      expect(res.apiKey).toMatch(/^scrn_test_/);
      expect(res.name).toBe("my-test-key");
      expect(res.createdAt).toBeTruthy();
      expect(res.expiresAt).toBeTruthy();

      await verifyApiKeyCreated({
        id: res.apiKeyId,
        name: "my-test-key",
        role: "test",
        revoked: false,
      });
    });

    it("dashboard key creates a live key", async () => {
      const res = await createAPIKey(
        authClient,
        { name: "my-live-key", expiresIn: 3600 },
        dashboardMetadata(dashKey, "production")
      );

      expect(res.apiKey).toMatch(/^scrn_live_/);
      expect(res.name).toBe("my-live-key");

      await verifyApiKeyCreated({
        id: res.apiKeyId,
        name: "my-live-key",
        role: "production",
        revoked: false,
      });
    });

    it("non-dashboard key cannot create keys", async () => {
      await expect(
        createAPIKey(
          authClient,
          { name: "should-fail", expiresIn: 3600 },
          grpcMetadata(`Bearer ${testKey}`)
        )
      ).rejects.toThrow("Only dashboard keys can create API keys");
    });

    it("rejects missing name", async () => {
      await expect(
        createAPIKey(
          authClient,
          { name: "", expiresIn: 3600 },
          dashboardMetadata(dashKey)
        )
      ).rejects.toThrow();
    });

    it("rejects zero expiresIn", async () => {
      await expect(
        createAPIKey(
          authClient,
          { name: "bad-expiry", expiresIn: 0 },
          dashboardMetadata(dashKey)
        )
      ).rejects.toThrow();
    });

    it("newly created key can register an event", async () => {
      const res = await createAPIKey(
        authClient,
        { name: "usable-key", expiresIn: 3600 },
        dashboardMetadata(dashKey, "test")
      );

      const db = getPostgresDB();
      await db.insert(webhookEndpointsTable).values({
        apiKeyId: res.apiKeyId,
        url: "https://example.com/webhook",
        privateKey: "test-private-key",
        publicKey: "test-public-key",
      });

      const userId = crypto.randomUUID();
      const eventId = crypto.randomUUID();
      const idempotencyKey = crypto.randomUUID();

      const eventRes = await registerEvent(
        eventClient,
        {
          type: EventType.BASIC_USAGE,
          userId,
          reportedTimestamp: Math.floor(DateTime.utc().toSeconds()),
          eventId,
          idempotencyKey,
          basicUsage: { basicUsageType: BasicUsageType.RAW, amount: 50 },
        },
        grpcMetadata(`Bearer ${res.apiKey}`)
      );

      expect(eventRes.message).toBe("Event stored successfully");

      await verifyBasicUsageEventStored({
        userId,
        eventId,
        idempotencyKey,
        debitAmount: 50,
        apiKeyId: res.apiKeyId,
        type: "RAW",
      });
    });
  });
});
