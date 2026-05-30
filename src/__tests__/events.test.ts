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

      expect(res.random).toBe("Event stored successfully");

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
  });
});
