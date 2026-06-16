import { eq, and, isNull } from "drizzle-orm";
import { EventError } from "../errors/event";
import { getPostgresDB } from "../storage/db/postgres/db";
import { tagsTable } from "../storage/db/postgres/schema";
import { tagCache } from "./tagCache";

export async function fetchTagAmount(
  tag: string,
  notFoundMessage: string,
  project_id?: string
): Promise<number> {
  const cacheKey = project_id ? `${project_id}:${tag}` : tag;
  const cachedAmount = tagCache.get(cacheKey);
  if (cachedAmount !== undefined) {
    return cachedAmount;
  }

  const db = getPostgresDB();
  const conditions = [eq(tagsTable.key, tag), isNull(tagsTable.deletedAt)];
  if (project_id) {
    conditions.push(eq(tagsTable.project_id, project_id));
  }
  const [tagRow] = await db
    .select()
    .from(tagsTable)
    .where(and(...conditions))
    .limit(1);

  if (!tagRow) {
    throw EventError.validationFailed(notFoundMessage);
  }

  tagCache.set(cacheKey, tagRow.amount);
  return tagRow.amount;
}
