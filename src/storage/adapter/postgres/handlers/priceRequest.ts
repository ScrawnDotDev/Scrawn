import { getPostgresDB } from "../../../db/postgres/db";
import {
  basicUsageEventsTable,
  aiTokenUsageEventsTable,
} from "../../../db/postgres/schema";
import { getLastBilledTimestamp } from "../../../db/postgres/helpers/sessions";
import { StorageError } from "../../../../errors/storage";
import { eq, sum, and, lt, gte, type SQL } from "drizzle-orm";
import type { DateTime } from "luxon";
import type { UserId } from "../../../../config/identifiers";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { AuthContext } from "../../../../context/auth";

type PriceEventTable =
  typeof basicUsageEventsTable | typeof aiTokenUsageEventsTable;

export async function handlePriceRequest(
  userId: UserId,
  priceTable: PriceEventTable,
  priceColumn: SQL,
  eventType: string,
  beforeTimestamp: DateTime,
  auth: AuthContext,
  txn?: PgTransaction<any, any, any>
): Promise<number> {
  const db = txn ?? getPostgresDB();

  try {
    if (!userId) {
      throw StorageError.invalidData(`Missing userId in ${eventType} event`);
    }

    if (typeof userId !== "string" || userId.trim().length === 0) {
      throw StorageError.invalidData(`Invalid userId format: ${typeof userId}`);
    }

    if (!auth.mode) {
      throw StorageError.invalidData(
        `Cannot price ${eventType} events without a production/test mode`
      );
    }

    const beforeIso = beforeTimestamp.toUTC().toISO();
    if (!beforeIso) {
      throw StorageError.invalidTimestamp(
        "beforeTimestamp is not a valid DateTime"
      );
    }

    const lastBilled = await getLastBilledTimestamp(
      auth.projectId,
      userId,
      auth.mode,
      txn
    );

    let result;
    try {
      // The billing window is keyed on the server-assigned ingestion time, not
      // the client-reported time, so every event lands in exactly one window:
      // [lastBilled, before). Events reported late or with backdated
      // timestamps are still billed in the next checkout.
      const whereClause = and(
        eq(priceTable.projectId, auth.projectId),
        eq(priceTable.userId, userId),
        eq(priceTable.mode, auth.mode),
        lt(priceTable.ingestedTimestamp, beforeIso),
        lastBilled ? gte(priceTable.ingestedTimestamp, lastBilled) : undefined
      );

      result = await db
        .select({
          price: sum(priceColumn),
        })
        .from(priceTable)
        .where(whereClause);
    } catch (e) {
      throw StorageError.queryFailed(
        `Failed to query ${eventType} events for user ${userId}`,
        e instanceof Error ? e : new Error(String(e))
      );
    }

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

    const priceValue = result[0].price;

    if (priceValue === null || priceValue === undefined) {
      return 0;
    }

    const parsedPrice = parseInt(priceValue, 10);

    if (isNaN(parsedPrice)) {
      throw StorageError.priceCalculationFailed(
        userId,
        new Error(`Price parsed to NaN from value: ${priceValue}`)
      );
    }

    return parsedPrice;
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
