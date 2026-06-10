import { getPostgresDB } from "../db";
import { projectsTable } from "../schema";
import { eq } from "drizzle-orm";
import { StorageError } from "../../../../errors/storage";

export async function createProject(name: string): Promise<{ id: string }> {
  const db = getPostgresDB();

  try {
    const [result] = await db
      .insert(projectsTable)
      .values({ name })
      .returning({ id: projectsTable.id });

    if (!result) {
      throw StorageError.emptyResult("Project insert returned no ID");
    }

    return { id: result.id };
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "name" in e &&
      (e as Error).name === "StorageError"
    ) {
      throw e;
    }
    throw StorageError.insertFailed(
      "Failed to create project",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

export async function listProjects(): Promise<
  (typeof projectsTable.$inferSelect)[]
> {
  const db = getPostgresDB();
  return db.select().from(projectsTable).orderBy(projectsTable.createdAt);
}

export async function deleteProject(projectId: string): Promise<boolean> {
  const db = getPostgresDB();

  try {
    const result = await db
      .delete(projectsTable)
      .where(eq(projectsTable.id, projectId));
    return (result.count ?? 0) > 0;
  } catch (e) {
    throw StorageError.queryFailed(
      "Failed to delete project",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

export async function getProject(
  projectId: string
): Promise<typeof projectsTable.$inferSelect | undefined> {
  const db = getPostgresDB();
  const [row] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .limit(1);
  return row;
}
