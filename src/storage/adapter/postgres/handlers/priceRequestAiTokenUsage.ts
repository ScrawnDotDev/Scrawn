import { aiTokenUsageEventsTable } from "../../../db/postgres/schema";
import { handlePriceRequest } from "./priceRequest";
import { sql } from "drizzle-orm";
import type { DateTime } from "luxon";
import type { UserId } from "../../../../config/identifiers";

export async function handlePriceRequestAiTokenUsage(
  userId: UserId,
  beforeTimestamp: DateTime,
  mode?: "production" | "test"
): Promise<number> {
  return handlePriceRequest(
    userId,
    aiTokenUsageEventsTable,
    sql`${aiTokenUsageEventsTable.inputDebitAmount} + ${aiTokenUsageEventsTable.outputDebitAmount}`,
    "REQUEST_AI_TOKEN_USAGE",
    beforeTimestamp,
    mode
  );
}
