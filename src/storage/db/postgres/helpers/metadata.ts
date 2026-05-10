import { getPostgresDB } from "../db";
import { metadataTable } from "../schema";
import { StorageError } from "../../../../errors/storage";
import { eq } from "drizzle-orm";

type UpsertMetadataInput = {
  payment_cron: string;
  payment_webhook: string | null;
};

export async function upsertMetadata(
  input: UpsertMetadataInput
): Promise<void> {
  const db = getPostgresDB();

  const { payment_cron: paymentCron, payment_webhook: paymentWebhook } = input;

  if (!paymentCron || paymentCron.trim().length === 0) {
    throw StorageError.invalidData("Invalid payment_cron: value is required");
  }

  if (paymentWebhook !== null && typeof paymentWebhook !== "string") {
    throw StorageError.invalidData(
      "Invalid payment_webhook: must be a string or null"
    );
  }

  try {
    const [existingMetadata] = await db
      .select({ id: metadataTable.id })
      .from(metadataTable)
      .limit(1);

    if (existingMetadata) {
      await db
        .update(metadataTable)
        .set({
          payment_cron: paymentCron,
          payment_webhook: paymentWebhook,
        })
        .where(eq(metadataTable.id, existingMetadata.id));
      return;
    }

    await db.insert(metadataTable).values({
      payment_cron: paymentCron,
      payment_webhook: paymentWebhook,
    });
  } catch (e) {
    throw StorageError.insertFailed(
      "Failed to upsert metadata record",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}
