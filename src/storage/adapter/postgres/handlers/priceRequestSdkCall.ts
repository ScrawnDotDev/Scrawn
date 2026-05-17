import { basicUsageEventsTable } from "../../../db/postgres/schema";
import { handlePriceRequest } from "./priceRequest";
import { sql } from "drizzle-orm";
import type { DateTime } from "luxon";
import type { UserId } from "../../../../config/identifiers";

export async function handlePriceRequestSdkCall(
  userId: UserId,
  beforeTimestamp: DateTime,
  mode: "production" | "test"
): Promise<number> {
  return handlePriceRequest(
    userId,
    basicUsageEventsTable,
    sql`${basicUsageEventsTable.debitAmount}`,
    "REQUEST_BASIC_USAGE",
    beforeTimestamp,
    mode
  );
}
