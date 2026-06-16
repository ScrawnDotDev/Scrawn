import type { PgDatabase, PgTransaction } from "drizzle-orm/pg-core";
import { getPostgresDB } from "../db";
import { metadataTable } from "../schema";
import { StorageError } from "../../../../errors/storage";
import { eq, asc } from "drizzle-orm";
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

function requireField<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw StorageError.insertFailed(
      `Missing required field '${name}' for metadata insert`,
      new Error(
        `Field '${name}' was not provided but is required for a new metadata row`
      )
    );
  }
  return value;
}

export async function upsertMetadata(
  input: UpsertMetadataInput,
  tx?: DbClient
): Promise<void> {
  const db = tx ?? getPostgresDB();

  const run = async (txn: DbClient) => {
    try {
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

      if (Object.keys(setValues).length === 0) return;

      await txn
        .insert(metadataTable)
        .values({
          project_id: input.project_id,
          dodo_live_api_key: requireField(
            input.dodo_live_api_key,
            "dodo_live_api_key"
          ),
          dodo_test_api_key: requireField(
            input.dodo_test_api_key,
            "dodo_test_api_key"
          ),
          dodo_live_product_id: requireField(
            input.dodo_live_product_id,
            "dodo_live_product_id"
          ),
          dodo_test_product_id: requireField(
            input.dodo_test_product_id,
            "dodo_test_product_id"
          ),
          dodo_live_webhook_secret: requireField(
            input.dodo_live_webhook_secret,
            "dodo_live_webhook_secret"
          ),
          dodo_test_webhook_secret: requireField(
            input.dodo_test_webhook_secret,
            "dodo_test_webhook_secret"
          ),
          redirect_url: requireField(input.redirect_url, "redirect_url"),
          currency: input.currency,
        })
        .onConflictDoUpdate({
          target: metadataTable.project_id,
          set: setValues,
        });
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
    .orderBy(asc(metadataTable.id))
    .limit(1);
  return metadata;
}
