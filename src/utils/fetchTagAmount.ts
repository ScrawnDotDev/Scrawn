import { eq } from "drizzle-orm";
import { EventError } from "../errors/event";
import { getPostgresDB } from "../storage/db/postgres/db";
import { tagsTable } from "../storage/db/postgres/schema";
import { tagCache } from "./tagCache";

export async function fetchTagAmount(
  tag: string,
  notFoundMessage: string
): Promise<number> {
  const cachedAmount = tagCache.get(tag);
  if (cachedAmount !== undefined) {
    return cachedAmount;
  }

  const db = getPostgresDB();
  const [tagRow] = await db
    .select()
    .from(tagsTable)
    .where(eq(tagsTable.key, tag))
    .limit(1);

  if (!tagRow) {
    throw EventError.validationFailed(notFoundMessage);
  }

  tagCache.set(tag, tagRow.amount);
  return tagRow.amount;
}
