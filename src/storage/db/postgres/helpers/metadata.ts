import { getPostgresDB } from "../db";
import { metadataTable } from "../schema";
import { StorageError } from "../../../../errors/storage";
import { eq } from "drizzle-orm";
import { executeInTransaction } from "../../../adapter/postgres/handlers/addEventUtils";
import { DateTime } from "luxon";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  encrypt,
  decrypt,
  isEncrypted,
} from "../../../../utils/encryptMetadata";

const DODO_FIELDS = [
  "dodo_live_api_key",
  "dodo_test_api_key",
  "dodo_webhook_secret",
] as const;

function decryptRow<T extends Record<string, unknown>>(row: T): T {
  const result = { ...row };
  for (const field of DODO_FIELDS) {
    const value = result[field];
    if (typeof value === "string") {
      if (isEncrypted(value)) {
        try {
          (result as Record<string, unknown>)[field] = decrypt(value);
        } catch {
          // leave as-is (e.g. plaintext from migration)
        }
      }
    }
  }
  return result;
}

export type UpsertMetadataInput = {
  payment_cron?: string[];
  payment_webhook?: string | null;
  dodo_live_api_key?: string | null;
  dodo_test_api_key?: string | null;
  dodo_product_id?: string;
  dodo_webhook_secret?: string | null;
  currency?: string;
  redirect_url?: string;
};

export async function upsertMetadata(
  input: UpsertMetadataInput
): Promise<void> {
  const db = getPostgresDB();

  if (input.payment_cron !== undefined) {
    if (
      !input.payment_cron ||
      input.payment_cron.length === 0 ||
      input.payment_cron.some((e) => !e || e.trim().length === 0)
    ) {
      throw StorageError.invalidData(
        "Invalid payment_cron: at least one non-empty expression is required"
      );
    }
  }

  if (
    input.payment_webhook !== undefined &&
    input.payment_webhook !== null &&
    typeof input.payment_webhook !== "string"
  ) {
    throw StorageError.invalidData(
      "Invalid payment_webhook: must be a string or null"
    );
  }

  await executeInTransaction(db, "upsert metadata", async (txn) => {
    try {
      const [existingMetadata] = await txn
        .select({ id: metadataTable.id })
        .from(metadataTable)
        .limit(1)
        .for("update");

      const setValues: Partial<typeof metadataTable.$inferInsert> = {};
      if (input.payment_cron !== undefined)
        setValues.payment_cron = input.payment_cron;
      if (input.payment_webhook !== undefined)
        setValues.payment_webhook = input.payment_webhook;
      if (input.dodo_live_api_key !== undefined)
        setValues.dodo_live_api_key = input.dodo_live_api_key
          ? encrypt(input.dodo_live_api_key)
          : null;
      if (input.dodo_test_api_key !== undefined)
        setValues.dodo_test_api_key = input.dodo_test_api_key
          ? encrypt(input.dodo_test_api_key)
          : null;
      if (input.dodo_product_id !== undefined)
        setValues.dodo_product_id = input.dodo_product_id;
      if (input.dodo_webhook_secret !== undefined)
        setValues.dodo_webhook_secret = input.dodo_webhook_secret
          ? encrypt(input.dodo_webhook_secret)
          : null;
      if (input.currency !== undefined) setValues.currency = input.currency;
      if (input.redirect_url !== undefined)
        setValues.redirect_url = input.redirect_url;

      if (existingMetadata) {
        if (Object.keys(setValues).length > 0) {
          await txn
            .update(metadataTable)
            .set(setValues)
            .where(eq(metadataTable.id, existingMetadata.id));
        }
        return;
      }

      const insertValues: typeof metadataTable.$inferInsert = {
        payment_cron: input.payment_cron ?? [],
        ...setValues,
      } as typeof metadataTable.$inferInsert;
      await txn.insert(metadataTable).values(insertValues);
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
  if (!metadata) return undefined;
  return decryptRow(metadata);
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
