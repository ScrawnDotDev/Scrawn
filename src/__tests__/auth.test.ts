import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Metadata } from "@grpc/grpc-js";
import {
  EventServiceClient,
  EventType,
  BasicUsageType,
} from "../gen/event/v1/event";
import {
  GRPC_ADDRESS,
  grpcInsecureCredentials,
  grpcMetadata,
  registerEvent,
} from "./fixtures/grpc";
import { getPostgresDB } from "../storage/db/postgres/db";
import { webhookEndpointsTable } from "../storage/db/postgres/schema";
import { DateTime } from "luxon";
import { clearDatabase } from "./db";
import { insertKey } from "./fixtures/apiKey";

async function insertWebhookEndpoint(apiKeyId: string): Promise<void> {
  const db = getPostgresDB();
  await db.insert(webhookEndpointsTable).values({
    apiKeyId,
    url: "https://example.com/webhook",
    privateKey: "test-private-key",
    publicKey: "test-public-key",
  });
}

function makeEvent() {
  return {
    type: EventType.BASIC_USAGE,
    userId: crypto.randomUUID(),
    reportedTimestamp: Math.floor(DateTime.utc().toSeconds()),
    eventId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    basicUsage: { basicUsageType: BasicUsageType.RAW, amount: 1 },
  };
}

function testKey(): string {
  return `scrn_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}`;
}

describe("Auth Interceptor", () => {
  let client: EventServiceClient;

  beforeAll(() => {
    client = new EventServiceClient(GRPC_ADDRESS, grpcInsecureCredentials);
  });

  afterAll(async () => {
    await clearDatabase();
    client.close();
  });

  it("1.1 rejects missing Authorization header", async () => {
    await expect(
      registerEvent(client, makeEvent(), new Metadata())
    ).rejects.toThrow("Missing Authorization header");
  });

  it("1.2 rejects malformed header (not Bearer)", async () => {
    const meta = new Metadata();
    meta.set("authorization", "Token abc");
    await expect(registerEvent(client, makeEvent(), meta)).rejects.toThrow(
      'Authorization header must be in format "Bearer <api_key>"'
    );
  });

  it("1.3 rejects bad key prefix", async () => {
    await expect(
      registerEvent(client, makeEvent(), grpcMetadata("Bearer xyz_abc"))
    ).rejects.toThrow("Invalid API key");
  });

  it("1.4 rejects invalid key format (right prefix, wrong length)", async () => {
    // Valid prefix but too short
    await expect(
      registerEvent(
        client,
        makeEvent(),
        grpcMetadata("Bearer scrn_test_tooshort")
      )
    ).rejects.toThrow("Invalid API key");
  });

  it("1.5 rejects revoked key", async () => {
    const raw = testKey();
    await insertKey(raw, "test", { revoked: true });

    await expect(
      registerEvent(client, makeEvent(), grpcMetadata(`Bearer ${raw}`))
    ).rejects.toThrow("API key has been revoked");
  });

  it("1.6 rejects expired key", async () => {
    const raw = testKey();
    await insertKey(raw, "test", {
      expiresAt: DateTime.utc().minus({ years: 1 }).toISO(),
    });

    await expect(
      registerEvent(client, makeEvent(), grpcMetadata(`Bearer ${raw}`))
    ).rejects.toThrow("API key has expired");
  });

  it("1.7 rejects role mismatch (dash prefix, test role in DB)", async () => {
    const raw = `scrn_dash_${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}`;
    await insertKey(raw, "test");

    await expect(
      registerEvent(client, makeEvent(), grpcMetadata(`Bearer ${raw}`))
    ).rejects.toThrow("doesn't match stored role");
  });

  it("1.8 dashboard key cannot ingest events", async () => {
    const raw = `scrn_dash_${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}`;
    await insertKey(raw, "dashboard");

    await expect(
      registerEvent(client, makeEvent(), grpcMetadata(`Bearer ${raw}`))
    ).rejects.toThrow("Dashboard keys cannot ingest events");
  });

  it("1.9 valid key succeeds twice (cache hit path)", async () => {
    const raw = testKey();
    const apiKeyId = await insertKey(raw, "test");
    await insertWebhookEndpoint(apiKeyId);
    const meta = grpcMetadata(`Bearer ${raw}`);

    const res1 = await registerEvent(client, makeEvent(), meta);
    expect(res1.message).toBe("Event stored successfully");

    const res2 = await registerEvent(client, makeEvent(), meta);
    expect(res2.message).toBe("Event stored successfully");
  });
});
