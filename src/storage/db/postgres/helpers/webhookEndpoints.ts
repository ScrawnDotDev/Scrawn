import { getPostgresDB } from "../db";
import { webhookEndpointsTable } from "../schema";
import { eq, and, isNull } from "drizzle-orm";
import { StorageError } from "../../../../errors/storage";
import { DateTime } from "luxon";

export type WebhookEndpoint = typeof webhookEndpointsTable.$inferSelect;

export async function getWebhookEndpointByApiKeyId(
  apiKeyId: string
): Promise<WebhookEndpoint | undefined> {
  const db = getPostgresDB();

  try {
    const [endpoint] = await db
      .select()
      .from(webhookEndpointsTable)
      .where(
        and(
          eq(webhookEndpointsTable.apiKeyId, apiKeyId),
          isNull(webhookEndpointsTable.deletedAt)
        )
      )
      .limit(1);

    return endpoint ?? undefined;
  } catch (e) {
    throw StorageError.queryFailed(
      "Failed to get webhook endpoint by API key ID",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

export async function upsertWebhookEndpoint(
  apiKeyId: string,
  url: string,
  privateKey: string,
  publicKey: string,
  project_id: string
): Promise<WebhookEndpoint> {
  const db = getPostgresDB();

  try {
    const now = DateTime.utc().toISO();

    const [result] = await db
      .insert(webhookEndpointsTable)
      .values({
        apiKeyId,
        url,
        privateKey,
        publicKey,
        createdAt: now,
        updatedAt: now,
        project_id,
      })
      .onConflictDoUpdate({
        target: webhookEndpointsTable.apiKeyId,
        set: {
          url,
          privateKey,
          publicKey,
          updatedAt: now,
          deletedAt: null,
        },
      })
      .returning();

    if (!result) {
      throw StorageError.emptyResult(
        "Webhook endpoint upsert returned no record"
      );
    }

    return result;
  } catch (e) {
    if (e instanceof StorageError) {
      throw e;
    }

    throw StorageError.insertFailed(
      "Failed to upsert webhook endpoint",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

export async function deleteWebhookEndpoint(
  apiKeyId: string
): Promise<boolean> {
  const db = getPostgresDB();

  try {
    const now = DateTime.utc().toISO();

    const result = await db
      .update(webhookEndpointsTable)
      .set({ deletedAt: now })
      .where(
        and(
          eq(webhookEndpointsTable.apiKeyId, apiKeyId),
          isNull(webhookEndpointsTable.deletedAt)
        )
      );

    return (result.count ?? 0) > 0;
  } catch (e) {
    throw StorageError.queryFailed(
      "Failed to soft-delete webhook endpoint",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}
