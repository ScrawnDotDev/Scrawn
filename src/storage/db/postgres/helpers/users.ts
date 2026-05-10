import { getPostgresDB } from "../db";
import { usersTable } from "../schema";
import { eq } from "drizzle-orm";

export async function userExists(userId: string): Promise<boolean> {
  const db = getPostgresDB();
  const result = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return result.length > 0;
}

export async function ensureUserExists(userId: string): Promise<void> {
  const db = getPostgresDB();

  try {
    await db
      .insert(usersTable)
      .values({ id: userId })
      .onConflictDoNothing({ target: usersTable.id });
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message.includes("duplicate") || e.message.includes("unique"))
    ) {
      return;
    }
    throw e;
  }
}

export { userExists as checkUserExists };
