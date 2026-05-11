import { getPostgresDB } from "../db";
import { tagsTable } from "../schema";
import { StorageError } from "../../../../errors/storage";

export async function listTags(): Promise<string[]> {
  const db = getPostgresDB();

  try {
    const rows = await db.select({ key: tagsTable.key }).from(tagsTable);
    return rows.map((row) => row.key);
  } catch (e) {
    throw StorageError.queryFailed(
      "Failed to list tags",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}
