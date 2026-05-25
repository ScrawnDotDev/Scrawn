import { describe, it, expect, beforeAll } from "vitest";
import * as grpc from "@grpc/grpc-js";
import {
  EventServiceClient,
  EventType,
  BasicUsageType,
} from "../gen/event/v1/event";
import {
  createGrpcCredentials,
  createTestApiKey,
  GRPC_ADDRESS,
} from "./helpers";

describe("EventService", () => {
  let rawKey: string;

  beforeAll(async () => {
    const key = await createTestApiKey();
    rawKey = key.rawKey;
  });

  it("registers a basic usage event", async () => {
    const client = new EventServiceClient(
      GRPC_ADDRESS,
      createGrpcCredentials()
    );
    const metadata = new grpc.Metadata();
    metadata.set("authorization", `Bearer ${rawKey}`);

    const response = await new Promise<{ random: string }>((resolve, reject) => {
      client.registerEvent(
        {
          type: EventType.BASIC_USAGE,
          userId: crypto.randomUUID(),
          reportedTimestamp: Math.floor(Date.now() / 1000),
          eventId: crypto.randomUUID(),
          idempotencyKey: crypto.randomUUID(),
          basicUsage: {
            basicUsageType: BasicUsageType.RAW,
            amount: 100,
          },
        },
        metadata,
        (error, res) => {
          client.close();
          if (error) reject(error);
          else resolve(res);
        }
      );
    });

    expect(response.random).toBe("Event stored successfully");
  });
});
