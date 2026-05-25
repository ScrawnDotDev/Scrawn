import * as grpc from "@grpc/grpc-js";
import { getPostgresDB } from "../storage/db/postgres/db";
import { apiKeysTable } from "../storage/db/postgres/schema";
import { hashAPIKey } from "../utils/hashAPIKey";
import { DateTime } from "luxon";

export function createGrpcCredentials(): grpc.ChannelCredentials {
  return grpc.credentials.createInsecure();
}

export const GRPC_TEST_PORT = 18069;
export const HTTP_TEST_PORT = 18070;
export const GRPC_ADDRESS = `localhost:${GRPC_TEST_PORT}`;
export const HTTP_BASE = `http://localhost:${HTTP_TEST_PORT}`;

export async function httpPost(
  path: string,
  body: unknown,
  headers?: Record<string, string>
) {
  return fetch(`${HTTP_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

export async function createTestApiKey(
  overrides?: Partial<typeof apiKeysTable.$inferInsert>
) {
  const db = getPostgresDB();
  const prefix = "scrn_test_";
  const randomPart = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
  const rawKey = `${prefix}${randomPart}`;
  const hashed = hashAPIKey(rawKey);
  const [key] = await db
    .insert(apiKeysTable)
    .values({
      name: "test-key",
      key: hashed,
      role: "test",
      expiresAt: DateTime.utc().plus({ years: 1 }).toISO(),
      ...overrides,
    })
    .returning({ id: apiKeysTable.id });

  return { rawKey, id: key!.id };
}
