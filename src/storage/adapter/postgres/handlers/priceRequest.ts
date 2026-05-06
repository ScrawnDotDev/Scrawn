import { getPostgresDB } from "../../../db/postgres/db";
import { eventsTable, usersTable } from "../../../db/postgres/schema";
import {
  sdkCallEventsTable,
  aiTokenUsageEventsTable,
} from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import { eq, sum, sql, and, type SQL } from "drizzle-orm";
import type { DateTime } from "luxon";
import type { UserId } from "../../../../config/identifiers";

type PriceEventTable =
  | typeof sdkCallEventsTable
  | typeof aiTokenUsageEventsTable;

export async function handlePriceRequest(
  userId: UserId,
  priceTable: PriceEventTable,
  priceColumn: SQL,
  eventType: string,
  beforeTimestamp: DateTime
): Promise<number> {
  const db = getPostgresDB();

  try {
    validateUserId(userId, eventType);

    const queryResult = await buildAndExecutePriceQuery(
      db,
      userId,
      priceTable,
      priceColumn,
      eventType,
      beforeTimestamp
    );

    return parsePriceResult(queryResult, userId);
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "type" in e &&
      (e as any).name === "StorageError"
    ) {
      throw e;
    }

    throw StorageError.priceCalculationFailed(
      `Failed to calculate price for ${eventType} event`,
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

function validateUserId(userId: UserId, eventType: string): void {
  if (!userId) {
    throw StorageError.invalidData(`Missing userId in ${eventType} event`);
  }

  if (typeof userId !== "string" || userId.trim().length === 0) {
    throw StorageError.invalidData(`Invalid userId format: ${typeof userId}`);
  }
}

async function buildAndExecutePriceQuery(
  db: ReturnType<typeof getPostgresDB>,
  userId: UserId,
  priceTable: PriceEventTable,
  priceColumn: SQL,
  eventType: string,
  beforeTimestamp: DateTime
): Promise<unknown> {
  try {
    const baseCondition = sql`${eventsTable.reported_timestamp} > ${usersTable.last_billed_timestamp} AND ${eventsTable.userId} = ${userId}`;
    const whereClause = beforeTimestamp
      ? and(
          baseCondition,
          sql`${eventsTable.reported_timestamp} < ${beforeTimestamp.toISO()}`
        )
      : baseCondition;

    const result = await db
      .select({
        price: sum(priceColumn),
      })
      .from(priceTable)
      .innerJoin(eventsTable, eq(priceTable.id, eventsTable.id))
      .innerJoin(usersTable, eq(eventsTable.userId, usersTable.id))
      .where(whereClause)
      .groupBy(eventsTable.userId);

    return result;
  } catch (e) {
    throw StorageError.queryFailed(
      `Failed to query ${eventType} events for user ${userId}`,
      e instanceof Error ? e : new Error(String(e))
    );
  }
}

function parsePriceResult(result: unknown, userId: UserId): number {
  if (!result) {
    throw StorageError.emptyResult(
      `Price query returned null for user ${userId}`
    );
  }

  if (!Array.isArray(result)) {
    throw StorageError.queryFailed(
      `Query result is not an array for user ${userId}`
    );
  }

  if (result.length === 0 || !result[0]) {
    return 0;
  }

  const priceValue = (result[0] as { price?: unknown }).price;

  if (priceValue === null || priceValue === undefined) {
    return 0;
  }

  let parsedPrice: number;
  try {
    parsedPrice = parseInt(priceValue as string);
  } catch (e) {
    throw StorageError.priceCalculationFailed(
      userId,
      new Error(`Failed to parse price value: ${priceValue}`)
    );
  }

  if (isNaN(parsedPrice)) {
    throw StorageError.priceCalculationFailed(
      userId,
      new Error(`Price parsed to NaN from value: ${priceValue}`)
    );
  }

  return parsedPrice;
}
