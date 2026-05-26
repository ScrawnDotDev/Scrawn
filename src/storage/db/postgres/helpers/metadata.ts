import { getPostgresDB } from "../db";
import { metadataTable } from "../schema";
import { StorageError } from "../../../../errors/storage";
import { eq } from "drizzle-orm";
import { executeInTransaction } from "../../../adapter/postgres/handlers/addEventUtils";
import { DateTime } from "luxon";
import type { PgTransaction } from "drizzle-orm/pg-core";

type UpsertMetadataInput = {
  payment_cron: string[];
  payment_webhook: string | null;
};

export async function upsertMetadata(
  input: UpsertMetadataInput
): Promise<void> {
  const db = getPostgresDB();

  const { payment_cron: paymentCron, payment_webhook: paymentWebhook } = input;

  if (!paymentCron || paymentCron.length === 0) {
    throw StorageError.invalidData(
      "Invalid payment_cron: at least one expression is required"
    );
  }

  if (paymentCron.some((e) => !e || e.trim().length === 0)) {
    throw StorageError.invalidData(
      "Invalid payment_cron: each expression must be a non-empty string"
    );
  }

  if (paymentWebhook !== null && typeof paymentWebhook !== "string") {
    throw StorageError.invalidData(
      "Invalid payment_webhook: must be a string or null"
    );
  }

  await executeInTransaction(db, "upsert metadata", async (txn) => {
    try {
      const [existingMetadata] = await txn
        .select({ id: metadataTable.id })
        .from(metadataTable)
        .limit(1);

      if (existingMetadata) {
        await txn
          .update(metadataTable)
          .set({
            payment_cron: paymentCron,
            payment_webhook: paymentWebhook,
          })
          .where(eq(metadataTable.id, existingMetadata.id));
        return;
      }

      await txn.insert(metadataTable).values({
        payment_cron: paymentCron,
        payment_webhook: paymentWebhook,
      });
    } catch (e) {
      throw StorageError.insertFailed(
        "Failed to upsert metadata record",
        e instanceof Error ? e : new Error(String(e))
      );
    }
  });
}

export async function getMetadata(): Promise<
  typeof metadataTable.$inferSelect | undefined
> {
  const db = getPostgresDB();
  const [metadata] = await db.select().from(metadataTable).limit(1);
  return metadata;
}

export async function tryClaimWebhookFire(
  txn: PgTransaction<any, any, any>,
  metadataId: string
): Promise<string | null> {
  const [metadata] = await txn
    .select({
      id: metadataTable.id,
      payment_webhook: metadataTable.payment_webhook,
      last_run_at: metadataTable.last_run_at,
    })
    .from(metadataTable)
    .where(eq(metadataTable.id, metadataId))
    .for("update");

  if (!metadata?.payment_webhook) {
    return null;
  }

  if (metadata.last_run_at) {
    const lastRun = DateTime.fromISO(metadata.last_run_at, {
      zone: "utc",
    });
    const minutesSince = DateTime.utc().diff(lastRun, "minutes").minutes;
    if (minutesSince < 30) {
      return null;
    }
  }

  await txn
    .update(metadataTable)
    .set({ last_run_at: DateTime.utc().toISO() })
    .where(eq(metadataTable.id, metadata.id));

  return metadata.payment_webhook;
}
