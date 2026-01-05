import { getPostgresDB } from "../../../db/postgres/db";
import {
  aiTokenUsageEventsTable,
  eventsTable,
} from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import { eq, sum, sql } from "drizzle-orm";
import { type SqlRecord } from "../../../../interface/event/Event";
import { logger } from "../../../../errors/logger";

const OPERATION = "PriceRequestAiTokenUsage";

export async function handlePriceRequestAiTokenUsage(
  event_data: SqlRecord<"REQUEST_AI_TOKEN_USAGE">,
): Promise<number> {
  const connectionObject = getPostgresDB();

  try {
    if (!event_data.userId) {
      throw StorageError.invalidData(
        "Missing userId in REQUEST_AI_TOKEN_USAGE event",
      );
    }

    if (
      typeof event_data.userId !== "string" ||
      event_data.userId.trim().length === 0
    ) {
      throw StorageError.invalidData(
        `Invalid userId format: ${typeof event_data.userId}`,
      );
    }

    logger.logOperationInfo(
      OPERATION,
      "start",
      "Querying price for REQUEST_AI_TOKEN_USAGE",
      { userId: event_data.userId },
    );

    let result;
    try {
      result = await connectionObject
        .select({
          price: sum(
            sql`${aiTokenUsageEventsTable.inputDebitAmount} + ${aiTokenUsageEventsTable.outputDebitAmount}`,
          ),
        })
        .from(aiTokenUsageEventsTable)
        .leftJoin(eventsTable, eq(aiTokenUsageEventsTable.id, eventsTable.id))
        .where(eq(eventsTable.userId, event_data.userId))
        .groupBy(eventsTable.userId);
    } catch (e) {
      throw StorageError.queryFailed(
        `Failed to query REQUEST_AI_TOKEN_USAGE events for user ${event_data.userId}`,
        e instanceof Error ? e : new Error(String(e)),
      );
    }

    if (!result) {
      throw StorageError.emptyResult(
        `Price query returned null for user ${event_data.userId}`,
      );
    }

    if (!Array.isArray(result)) {
      throw StorageError.queryFailed(
        `Query result is not an array for user ${event_data.userId}`,
      );
    }

    if (result.length === 0 || !result[0]) {
      logger.logOperationInfo(
        OPERATION,
        "no_events",
        "No AI token usage events found, returning 0",
        { userId: event_data.userId },
      );
      return 0;
    }

    const priceValue = result[0].price;

    if (priceValue === null || priceValue === undefined) {
      logger.logOperationInfo(
        OPERATION,
        "null_price",
        "Price is null/undefined, returning 0",
        { userId: event_data.userId },
      );
      return 0;
    }

    let parsedPrice: number;
    try {
      parsedPrice = parseInt(priceValue);
    } catch (e) {
      throw StorageError.priceCalculationFailed(
        event_data.userId,
        new Error(`Failed to parse price value: ${priceValue}`),
      );
    }

    if (isNaN(parsedPrice)) {
      throw StorageError.priceCalculationFailed(
        event_data.userId,
        new Error(`Price parsed to NaN from value: ${priceValue}`),
      );
    }

    if (parsedPrice < 0) {
      logger.logWarning("Negative price calculated", {
        userId: event_data.userId,
        price: parsedPrice,
      });
    }

    logger.logOperationInfo(
      OPERATION,
      "completed",
      "Price calculated successfully",
      { userId: event_data.userId, price: parsedPrice },
    );

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
      e instanceof Error ? e : new Error(String(e)),
    );
  }
}
