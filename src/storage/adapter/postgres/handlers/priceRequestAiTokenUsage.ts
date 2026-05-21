import { aiTokenUsageEventsTable } from "../../../db/postgres/schema";
import { handlePriceRequest } from "./priceRequest";
import { sql } from "drizzle-orm";
import type { DateTime } from "luxon";
import type { UserId } from "../../../../config/identifiers";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { AuthContext } from "../../../../context/auth";

export async function handlePriceRequestAiTokenUsage(
  userId: UserId,
  beforeTimestamp: DateTime,
  auth: AuthContext,
  txn?: PgTransaction<any, any, any>
): Promise<number> {
  return handlePriceRequest(
    userId,
    aiTokenUsageEventsTable,
    sql`CAST(${aiTokenUsageEventsTable.metrics}->'debit_amount'->>'input' AS integer) + CAST(${aiTokenUsageEventsTable.metrics}->'debit_amount'->>'input_cache' AS integer) + CAST(${aiTokenUsageEventsTable.metrics}->'debit_amount'->>'output' AS integer)`,
    "REQUEST_AI_TOKEN_USAGE",
    beforeTimestamp,
    auth,
    txn
  );
}
