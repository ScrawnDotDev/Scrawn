import { expect } from "vitest";
import * as grpc from "@grpc/grpc-js";
import type {
  EventServiceClient,
  RegisterEventRequest,
  RegisterEventResponse,
} from "../gen/event/v1/event";
import { getPostgresDB } from "../storage/db/postgres/db";
import {
  basicUsageEventsTable,
  apiKeysTable,
} from "../storage/db/postgres/schema";
import { hashAPIKey } from "../utils/hashAPIKey";
import { eq } from "drizzle-orm";
import { DateTime } from "luxon";

export const GRPC_ADDRESS = "localhost:18069";

export function grpcCredentials(): grpc.ChannelCredentials {
  return grpc.credentials.createInsecure();
}

export function grpcMetadata(authHeader: string): grpc.Metadata {
  const metadata = new grpc.Metadata();
  metadata.set("authorization", authHeader);
  return metadata;
}

export function registerEvent(
  client: EventServiceClient,
  request: RegisterEventRequest,
  metadata: grpc.Metadata
): Promise<RegisterEventResponse> {
  return new Promise((resolve, reject) => {
    client.registerEvent(request, metadata, (error, res) => {
      if (error) reject(error);
      else if (!res) reject(new Error("empty response"));
      else resolve(res);
    });
  });
}

export async function createTestApiKey(): Promise<{
  rawKey: string;
  id: string;
}> {
  const db = getPostgresDB();
  const rawKey = `scrn_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}`;
  const [key] = await db
    .insert(apiKeysTable)
    .values({
      name: `test-key-${crypto.randomUUID()}`,
      key: hashAPIKey(rawKey),
      role: "test",
      expiresAt: DateTime.utc().plus({ years: 1 }).toISO(),
    })
    .returning({ id: apiKeysTable.id });
  return { rawKey, id: key!.id };
}

type StoredBasicUsageEvent = {
  event_id: string;
  idempotency_key: string;
  user_id: string;
  reported_timestamp: string;
  api_key_id: string | null;
  mode: string;
  type: string;
  debit_amount: number;
};

export async function verifyBasicUsageEventStored(expected: {
  userId: string;
  eventId: string;
  idempotencyKey: string;
  debitAmount: number;
  apiKeyId: string;
  type: string;
}): Promise<void> {
  if (process.env.STORAGE_ADAPTER !== "clickhouse") {
    const db = getPostgresDB();
    const [row] = await db
      .select()
      .from(basicUsageEventsTable)
      .where(eq(basicUsageEventsTable.eventId, expected.eventId))
      .limit(1);

    console.log("Queried event row from Postgres:", row);

    expect(row).toBeDefined();
    expect(row!.eventId).toBe(expected.eventId);
    expect(row!.idempotencyKey).toBe(expected.idempotencyKey);
    expect(row!.userId).toBe(expected.userId);
    expect(row!.apiKeyId).toBe(expected.apiKeyId);
    expect(row!.mode).toBe("test");
    expect(row!.type).toBe(expected.type);
    expect(row!.debitAmount).toBe(expected.debitAmount);
    return;
  }

  const { getClickHouseDB } = await import("../storage/db/clickhouse");
  const result = await getClickHouseDB().query({
    query: `SELECT * FROM basic_usage_events WHERE event_id = {eventId:String}`,
    query_params: { eventId: expected.eventId },
    format: "JSONEachRow",
  });
  const rows = (await result.json()) as StoredBasicUsageEvent[];

  expect(rows.length).toBeGreaterThanOrEqual(1);
  const row = rows[0]!;
  expect(row.event_id).toBe(expected.eventId);
  expect(row.idempotency_key).toBe(expected.idempotencyKey);
  expect(row.user_id).toBe(expected.userId);
  expect(row.api_key_id).toBe(expected.apiKeyId);
  expect(row.mode).toBe("test");
  expect(row.type).toBe(expected.type);
  expect(row.debit_amount).toBe(expected.debitAmount);
}
