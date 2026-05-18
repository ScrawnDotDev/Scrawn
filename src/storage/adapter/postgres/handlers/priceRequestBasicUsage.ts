import { basicUsageEventsTable } from "../../../db/postgres/schema";
import { handlePriceRequest } from "./priceRequest";
import { sql } from "drizzle-orm";
import type { DateTime } from "luxon";
import type { UserId } from "../../../../config/identifiers";
import type { PgTransaction } from "drizzle-orm/pg-core";

export async function handlePriceRequestBasicUsage(
  userId: UserId,
  beforeTimestamp: DateTime,
  mode: "production" | "test",
  txn?: PgTransaction<any, any, any>
): Promise<number> {
  return handlePriceRequest(
    userId,
    basicUsageEventsTable,
    sql`${basicUsageEventsTable.debitAmount}`,
    "REQUEST_BASIC_USAGE",
    beforeTimestamp,
    mode,
    txn
  );
}
