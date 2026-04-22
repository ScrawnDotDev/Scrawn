import { getPostgresDB } from "../../../db/postgres/db";
import {
  aiTokenUsageEventsTable,
  eventsTable,
} from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import { eq, sum, sql } from "drizzle-orm";
import { type SqlRecord } from "../../../../interface/event/Event";
import { type UserId } from "../../../../config/identifiers";

export async function handlePriceRequestAiTokenUsage(
  userId: UserId
): Promise<number> {
  const connectionObject = getPostgresDB();

  try {
    if (!userId) {
      throw StorageError.invalidData(
        "Missing userId in REQUEST_AI_TOKEN_USAGE event"
      );
    }

    if (typeof userId !== "string" || userId.trim().length === 0) {
      throw StorageError.invalidData(`Invalid userId format: ${typeof userId}`);
    }

    let result;
    try {
      result = await connectionObject
        .select({
          price: sum(
            sql`${aiTokenUsageEventsTable.inputDebitAmount} + ${aiTokenUsageEventsTable.outputDebitAmount}`
          ),
        })
        .from(aiTokenUsageEventsTable)
        .leftJoin(eventsTable, eq(aiTokenUsageEventsTable.id, eventsTable.id))
        .where(eq(eventsTable.userId, userId))
        .groupBy(eventsTable.userId);
    } catch (e) {
      throw StorageError.queryFailed(
        `Failed to query REQUEST_AI_TOKEN_USAGE events for user ${userId}`,
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

    let parsedPrice: number;
    try {
      parsedPrice = parseInt(priceValue);
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
  } catch (e) {
    // Use duck typing instead of instanceof to work with mocked modules
    if (
      e &&
      typeof e === "object" &&
      "type" in e &&
      (e as any).name === "StorageError"
    ) {
      throw e;
    }

    throw StorageError.priceCalculationFailed(
      "Failed to calculate price for REQUEST_AI_TOKEN_USAGE event",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}
