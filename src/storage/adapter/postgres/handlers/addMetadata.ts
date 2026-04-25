import { getPostgresDB } from "../../../db/postgres/db";
import { metadataTable } from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import { type SqlRecord } from "../../../../interface/event/Event";
import { eq } from "drizzle-orm";

export async function handleAddMetadata(
  event_data: SqlRecord<"METADATA">
): Promise<void> {
  const connectionObject = getPostgresDB();

  const paymentCron = event_data?.data?.payment_cron;
  const paymentWebhook = event_data?.data?.payment_webhook;

  if (!paymentCron || paymentCron.trim().length === 0) {
    throw StorageError.invalidData("Invalid payment_cron: value is required");
  }

  if (paymentWebhook !== null && typeof paymentWebhook !== "string") {
    throw StorageError.invalidData(
      "Invalid payment_webhook: must be a string or null"
    );
  }

  try {
    const [existingMetadata] = await connectionObject
      .select({ id: metadataTable.id })
      .from(metadataTable)
      .limit(1);

    if (existingMetadata) {
      await connectionObject
        .update(metadataTable)
        .set({
          payment_cron: paymentCron,
          payment_webhook: paymentWebhook,
        })
        .where(eq(metadataTable.id, existingMetadata.id));
      return;
    }

    await connectionObject.insert(metadataTable).values({
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
