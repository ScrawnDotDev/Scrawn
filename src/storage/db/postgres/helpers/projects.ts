import { eq } from "drizzle-orm";
import type { PgDatabase, PgTransaction } from "drizzle-orm/pg-core";
import { getPostgresDB } from "../db";
import { projectTable } from "./../schema";
import { StorageError } from "../../../../errors/storage";

export type DbClient = PgDatabase<any, any, any> | PgTransaction<any, any, any>;

export async function createProject(
  project_id: string,
  product_id: string,
  tx?: DbClient
): Promise<void> {
  const db = tx ?? getPostgresDB();

  try {
    const existing = await db
      .select({ project_id: projectTable.project_id })
      .from(projectTable)
      .where(eq(projectTable.project_id, project_id))
      .limit(1);

    if (existing[0]) {
      await db
        .update(projectTable)
        .set({ product_id })
        .where(eq(projectTable.project_id, existing[0].project_id));
      return;
    }

    await db.insert(projectTable).values({ project_id, product_id });
  } catch (e) {
    throw StorageError.insertFailed(
      `Failed to create project '${project_id}'`,
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

export async function getProject(
  project_id: string
): Promise<typeof projectTable.$inferSelect | undefined> {
  const db = getPostgresDB();
  const [row] = await db
    .select()
    .from(projectTable)
    .where(eq(projectTable.project_id, project_id))
    .limit(1);
  return row;
}
