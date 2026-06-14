import { getPostgresDB } from "../db";
import { tagsTable } from "../schema";
import { eq, and, isNull } from "drizzle-orm";
import { StorageError } from "../../../../errors/storage";
import { DateTime } from "luxon";
import { tagCache } from "../../../../utils/tagCache";

export async function listTags(): Promise<{ key: string; amount: number }[]> {
  const db = getPostgresDB();

  try {
    const rows = await db
      .select({ key: tagsTable.key, amount: tagsTable.amount })
      .from(tagsTable)
      .where(isNull(tagsTable.deletedAt));
    return rows;
  } catch (e) {
    throw StorageError.queryFailed(
      "Failed to list tags",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

export async function createTag(
  key: string,
  amount: number,
  project_id: string
): Promise<void> {
  const db = getPostgresDB();

  try {
    const existing = await db
      .select({ id: tagsTable.id })
      .from(tagsTable)
      .where(and(eq(tagsTable.key, key), isNull(tagsTable.deletedAt)))
      .limit(1);

    if (existing[0]) {
      await db
        .update(tagsTable)
        .set({ amount })
        .where(eq(tagsTable.id, existing[0].id));
      tagCache.delete(key);
      return;
    }

    await db.insert(tagsTable).values({ key, amount, project_id });
    tagCache.delete(key);
  } catch (e) {
    throw StorageError.insertFailed(
      `Failed to upsert tag '${key}'`,
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

export async function deleteTag(key: string): Promise<boolean> {
  const db = getPostgresDB();

  try {
    const now = DateTime.utc().toISO();
    const result = await db
      .update(tagsTable)
      .set({ deletedAt: now })
      .where(and(eq(tagsTable.key, key), isNull(tagsTable.deletedAt)));

    if ((result.count ?? 0) > 0) {
      tagCache.delete(key);
      return true;
    }
    return false;
  } catch (e) {
    throw StorageError.queryFailed(
      `Failed to soft-delete tag '${key}'`,
      e instanceof Error ? e : new Error(String(e))
    );
  }
}
