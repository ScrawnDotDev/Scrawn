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
import { DateTime } from "luxon";

type RegisterEventResult = { random: string };

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

    const response: RegisterEventResult =
      await new Promise<RegisterEventResult>(
        (
          resolve: (value: RegisterEventResult) => void,
          reject: (reason?: unknown) => void
        ): void => {
          client.registerEvent(
            {
              type: EventType.BASIC_USAGE,
              userId: crypto.randomUUID(),
              reportedTimestamp: Math.floor(DateTime.utc().toSeconds()),
              eventId: crypto.randomUUID(),
              idempotencyKey: crypto.randomUUID(),
              basicUsage: {
                basicUsageType: BasicUsageType.RAW,
                amount: 100,
              },
            },
            metadata,
            (
              error: grpc.ServiceError | null,
              res: RegisterEventResult | undefined
            ): void => {
              client.close();
              if (error) {
                reject(error);
                return;
              }
              if (!res) {
                reject(new Error("registerEvent returned no response"));
                return;
              }
              resolve(res);
            }
          );
        }
      );

    expect(response.random).toBe("Event stored successfully");
  });
});
