import { getPostgresDB } from "../db";
import { expressionsTable } from "../schema";
import { eq, and, isNull } from "drizzle-orm";
import { StorageError } from "../../../../errors/storage";
import { DateTime } from "luxon";

export async function listExpressions(): Promise<string[]> {
  const db = getPostgresDB();

  try {
    const rows = await db
      .select({ key: expressionsTable.key })
      .from(expressionsTable)
      .where(isNull(expressionsTable.deletedAt));
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
      .where(
        and(eq(expressionsTable.key, key), isNull(expressionsTable.deletedAt))
      )
      .limit(1);

    return record?.expr ?? null;
  } catch (e) {
    throw StorageError.queryFailed(
      `Failed to look up expression '${key}'`,
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

export async function createExpression(
  key: string,
  expr: string,
  project_id: string
): Promise<void> {
  const db = getPostgresDB();

  try {
    const existing = await db
      .select({ id: expressionsTable.id })
      .from(expressionsTable)
      .where(
        and(eq(expressionsTable.key, key), isNull(expressionsTable.deletedAt))
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(expressionsTable)
        .set({ expr })
        .where(eq(expressionsTable.id, existing[0].id));
      return;
    }

    await db.insert(expressionsTable).values({ key, expr, project_id });
  } catch (e) {
    throw StorageError.insertFailed(
      `Failed to upsert expression '${key}'`,
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

export async function deleteExpression(key: string): Promise<boolean> {
  const db = getPostgresDB();

  try {
    const now = DateTime.utc().toISO();
    const result = await db
      .update(expressionsTable)
      .set({ deletedAt: now })
      .where(
        and(eq(expressionsTable.key, key), isNull(expressionsTable.deletedAt))
      );

    return (result.count ?? 0) > 0;
  } catch (e) {
    throw StorageError.queryFailed(
      `Failed to soft-delete expression '${key}'`,
      e instanceof Error ? e : new Error(String(e))
    );
  }
}
