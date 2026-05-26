import { getPostgresDB } from "../db";
import { expressionsTable } from "../schema";
import { StorageError } from "../../../../errors/storage";
import { eq } from "drizzle-orm";

export async function listExpressions(): Promise<string[]> {
  const db = getPostgresDB();

  try {
    const rows = await db
      .select({ key: expressionsTable.key })
      .from(expressionsTable);
    return rows.map((row) => row.key);
  } catch (e) {
    throw StorageError.queryFailed(
      "Failed to list expressions",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

export async function findExpressionByKey(key: string): Promise<string | null> {
  const db = getPostgresDB();

  try {
    const [record] = await db
      .select({ expr: expressionsTable.expr })
      .from(expressionsTable)
      .where(eq(expressionsTable.key, key))
      .limit(1);

    return record?.expr ?? null;
  } catch (e) {
    throw StorageError.queryFailed(
      `Failed to look up expression '${key}'`,
      e instanceof Error ? e : new Error(String(e))
    );
  }
}
