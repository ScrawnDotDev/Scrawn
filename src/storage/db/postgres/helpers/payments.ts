import { getPostgresDB } from "../db";
import { paymentEventsTable } from "../schema";
import { StorageError } from "../../../../errors/storage";
import { DateTime } from "luxon";

export async function handleAddPayment(
  userId: string,
  creditAmount: number,
  apiKeyId: string,
  mode: "test" | "production"
): Promise<{ id: string }> {
  if (
    creditAmount === undefined ||
    creditAmount === null ||
    typeof creditAmount !== "number" ||
    !Number.isFinite(creditAmount) ||
    creditAmount < 0
  ) {
    throw StorageError.invalidData(
      `Invalid creditAmount: must be a positive finite number, got ${String(creditAmount)}`
    );
  }

  const db = getPostgresDB();

  try {
    const [result] = await db
      .insert(paymentEventsTable)
      .values({
        reportedTimestamp: DateTime.utc().toISO()!,
        userId,
        apiKeyId,
        mode,
        creditAmount,
      })
      .returning({ id: paymentEventsTable.id });

    if (!result) {
      throw StorageError.emptyResult("Payment insert returned no ID");
    }

    return { id: result.id };
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "type" in e &&
      (e as any).name === "StorageError"
    ) {
      throw e;
    }

    throw StorageError.insertFailed(
      "Failed to insert payment event",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}
