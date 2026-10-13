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
import { createTestApiKey } from "./fixtures/apiKey";
import { verifyBasicUsageEventStored } from "./assertions/events";
import { clearDatabase } from "./db";
import { DateTime } from "luxon";
import { BasicUsage } from "../events/BasicUsage";
import { AITokenUsage } from "../events/AITokenUsage";

function makeEventPayload() {
  return {
    type: EventType.BASIC_USAGE,
    userId: crypto.randomUUID(),
    reportedTimestamp: Math.floor(DateTime.utc().toSeconds()),
    eventId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    basicUsage: { basicUsageType: BasicUsageType.RAW, amount: 100 },
  };
}

describe("EventService", () => {
  let client: EventServiceClient;
  let rawKey: string;
  let apiKeyId: string;

  beforeAll(async () => {
    client = new EventServiceClient(GRPC_ADDRESS, grpcInsecureCredentials);
    const key = await createTestApiKey();
    rawKey = key.rawKey;
    apiKeyId = key.id;
  });

  afterAll(async () => {
    await clearDatabase();
    client.close();
  });

  describe("registerEvent", () => {
    it("stores a basic usage event with correct data", async () => {
      const payload = makeEventPayload();

      const res = await registerEvent(
        client,
        payload,
        grpcMetadata(`Bearer ${rawKey}`)
      );

      expect(res.message).toBe("Event stored successfully");

      await verifyBasicUsageEventStored({
        userId: payload.userId,
        eventId: payload.eventId,
        idempotencyKey: payload.idempotencyKey,
        debitAmount: 100,
        apiKeyId,
        type: "RAW",
      });
    });

    it("rejects unauthenticated requests", async () => {
      await expect(
        registerEvent(client, makeEventPayload(), new Metadata())
      ).rejects.toThrow("Missing Authorization header");
    });

    it("rejects requests with an invalid API key", async () => {
      await expect(
        registerEvent(
          client,
          makeEventPayload(),
          grpcMetadata("Bearer bad_key")
        )
      ).rejects.toThrow("Invalid API key");
    });

    it("rejects duplicate idempotency key", async () => {
      const payload = makeEventPayload();

      await registerEvent(client, payload, grpcMetadata(`Bearer ${rawKey}`));

      await expect(
        registerEvent(client, payload, grpcMetadata(`Bearer ${rawKey}`))
      ).rejects.toThrow("Database constraint violation");
    });

    it("rejects negative debit amount", async () => {
      const payload = {
        ...makeEventPayload(),
        basicUsage: { basicUsageType: BasicUsageType.RAW, amount: -50 },
      };

      await expect(
        registerEvent(client, payload, grpcMetadata(`Bearer ${rawKey}`))
      ).rejects.toThrow("Negative debit amount");
    });

    it("stores event with metadata", async () => {
      const metadata = { source: "test", priority: 1 };
      const payload = {
        ...makeEventPayload(),
        basicUsage: {
          basicUsageType: BasicUsageType.RAW,
          amount: 100,
          metadata: JSON.stringify(metadata),
        },
      };

      const res = await registerEvent(
        client,
        payload,
        grpcMetadata(`Bearer ${rawKey}`)
      );
      expect(res.message).toBe("Event stored successfully");

      await verifyBasicUsageEventStored({
        userId: payload.userId,
        eventId: payload.eventId,
        idempotencyKey: payload.idempotencyKey,
        debitAmount: 100,
        apiKeyId,
        type: "RAW",
        metadata,
      });
    });
  });
});

describe("BasicUsage", () => {
  it("serializes with SQL shape", () => {
    const ts = DateTime.utc();
    const event = new BasicUsage(
      "user-1",
      ts,
      { basicUsageType: "RAW", debitAmount: 50 },
      "e1",
      "idem-1"
    );
    const s = event.serialize();
    expect(s.SQL.type).toBe("BASIC_USAGE");
    expect(s.SQL.userId).toBe("user-1");
    expect(s.SQL.eventId).toBe("e1");
    expect(s.SQL.data.debitAmount).toBe(50);
  });
});

describe("AITokenUsage", () => {
  it("serializes with SQL shape", () => {
    const ts = DateTime.utc();
    const event = new AITokenUsage(
      "user-2",
      ts,
      {
        model: "gpt-4",
        provider: "openai",
        inputTokens: 100,
        inputCacheTokens: 0,
        outputTokens: 50,
        outputCacheTokens: 0,
        inputDebitAmount: 10,
        inputCacheDebitAmount: 0,
        outputCacheDebitAmount: 0,
        outputDebitAmount: 20,
      },
      "e2",
      "idem-2"
    );
    const s = event.serialize();
    expect(s.SQL.type).toBe("AI_TOKEN_USAGE");
    expect(s.SQL.data.model).toBe("gpt-4");
    expect(s.SQL.data.inputDebitAmount).toBe(10);
  });
});
