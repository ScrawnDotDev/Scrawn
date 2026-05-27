import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Metadata } from "@grpc/grpc-js";
import {
  EventServiceClient,
  EventType,
  BasicUsageType,
} from "../gen/event/v1/event";
import {
  grpcCredentials,
  grpcMetadata,
  createTestApiKey,
  registerEvent,
  verifyBasicUsageEventStored,
  GRPC_ADDRESS,
} from "./helpers";
import { DateTime } from "luxon";

describe("EventService", () => {
  let client: EventServiceClient;
  let rawKey: string;
  let apiKeyId: string;

  beforeAll(async () => {
    client = new EventServiceClient(GRPC_ADDRESS, grpcCredentials());
    const key = await createTestApiKey();
    rawKey = key.rawKey;
    apiKeyId = key.id;
  });

  afterAll(() => {
    client.close();
  });

  describe("registerEvent", () => {
    it("stores a basic usage event with correct data", async () => {
      const payload = {
        type: EventType.BASIC_USAGE,
        userId: crypto.randomUUID(),
        reportedTimestamp: Math.floor(DateTime.utc().toSeconds()),
        eventId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        basicUsage: { basicUsageType: BasicUsageType.RAW, amount: 100 },
      };

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
        registerEvent(
          client,
          {
            type: EventType.BASIC_USAGE,
            userId: crypto.randomUUID(),
            reportedTimestamp: Math.floor(DateTime.utc().toSeconds()),
            eventId: crypto.randomUUID(),
            idempotencyKey: crypto.randomUUID(),
            basicUsage: { basicUsageType: BasicUsageType.RAW, amount: 100 },
          },
          new Metadata()
        )
      ).rejects.toThrow("Missing Authorization header");
    });

    it("rejects requests with an invalid API key", async () => {
      await expect(
        registerEvent(
          client,
          {
            type: EventType.BASIC_USAGE,
            userId: crypto.randomUUID(),
            reportedTimestamp: Math.floor(DateTime.utc().toSeconds()),
            eventId: crypto.randomUUID(),
            idempotencyKey: crypto.randomUUID(),
            basicUsage: { basicUsageType: BasicUsageType.RAW, amount: 100 },
          },
          grpcMetadata("Bearer bad_key")
        )
      ).rejects.toThrow("Invalid API key");
    });
  });
});
