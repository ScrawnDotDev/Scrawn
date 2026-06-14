import type { PgDatabase, PgTransaction } from "drizzle-orm/pg-core";
import { getPostgresDB } from "../db";
import { metadataTable } from "../schema";
import { StorageError } from "../../../../errors/storage";
import { eq } from "drizzle-orm";
import { executeInTransaction } from "../../../adapter/postgres/handlers/addEventUtils";

export type DbClient = PgDatabase<any, any, any> | PgTransaction<any, any, any>;

export type UpsertMetadataInput = {
  dodo_live_api_key?: string;
  dodo_test_api_key?: string;
  dodo_live_product_id?: string;
  dodo_test_product_id?: string;
  dodo_live_webhook_secret?: string;
  dodo_test_webhook_secret?: string;
  currency?: string;
  redirect_url?: string;
  project_id: string;
};

export async function upsertMetadata(
  input: UpsertMetadataInput,
  tx?: DbClient
): Promise<void> {
  const db = tx ?? getPostgresDB();

  const run = async (txn: DbClient) => {
    try {
      const [existingMetadata] = await txn
        .select({ id: metadataTable.id })
        .from(metadataTable)
        .where(eq(metadataTable.project_id, input.project_id))
        .limit(1)
        .for("update");

      const setValues: Partial<typeof metadataTable.$inferInsert> = {};
      if (input.dodo_live_api_key !== undefined)
        setValues.dodo_live_api_key = input.dodo_live_api_key;
      if (input.dodo_test_api_key !== undefined)
        setValues.dodo_test_api_key = input.dodo_test_api_key;
      if (input.dodo_live_product_id !== undefined)
        setValues.dodo_live_product_id = input.dodo_live_product_id;
      if (input.dodo_test_product_id !== undefined)
        setValues.dodo_test_product_id = input.dodo_test_product_id;
      if (input.dodo_live_webhook_secret !== undefined)
        setValues.dodo_live_webhook_secret = input.dodo_live_webhook_secret;
      if (input.dodo_test_webhook_secret !== undefined)
        setValues.dodo_test_webhook_secret = input.dodo_test_webhook_secret;
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
        ...setValues,
        project_id: input.project_id,
      } as typeof metadataTable.$inferInsert;
      await txn.insert(metadataTable).values(insertValues);
    } catch (e) {
      throw StorageError.insertFailed(
        "Failed to upsert metadata record",
        e instanceof Error ? e : new Error(String(e))
      );
    }
  };

  if (tx) {
    await run(tx);
  } else {
    await executeInTransaction(db, "upsert metadata", run);
  }
}

export async function getMetadata(
  project_id: string
): Promise<typeof metadataTable.$inferSelect | undefined> {
  const db = getPostgresDB();
  const [metadata] = await db
    .select()
    .from(metadataTable)
    .where(eq(metadataTable.project_id, project_id))
    .limit(1);
  return metadata;
}
