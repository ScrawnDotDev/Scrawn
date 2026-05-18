import { StorageAdapterFactory } from "../factory/EventStorageAdapterFactory";
import { StorageError } from "../errors/storage";
import type { UserId } from "../config/identifiers";
import type { DateTime } from "luxon";
import { getPostgresDB } from "../storage/db/postgres/db";
import { executeInTransaction } from "../storage/adapter/postgres/handlers/addEventUtils";

export async function calculatePaymentPrice(
  userId: UserId,
  beforeTimestamp: DateTime,
  mode: "production" | "test"
): Promise<number> {
  const beforeTimestampUtc = beforeTimestamp.toUTC();

  if (!userId) {
    throw StorageError.invalidData("Missing userId in PAYMENT price request");
  }

  const sdkAdapter =
    await StorageAdapterFactory.getEventStorageAdapter("BASIC_USAGE");
  const aiAdapter =
    await StorageAdapterFactory.getEventStorageAdapter("AI_TOKEN_USAGE");

  return await executeInTransaction(
    getPostgresDB(),
    "calculating payment price",
    async (txn) => {
      const sdkPrice = await sdkAdapter.price(
        userId,
        "BASIC_USAGE",
        beforeTimestampUtc,
        mode,
        txn
      );

      if (typeof sdkPrice !== "number" || isNaN(sdkPrice)) {
        throw StorageError.priceCalculationFailed(
          userId,
          new Error(`Invalid SDK price value returned: ${sdkPrice}`)
        );
      }

      const aiPrice = await aiAdapter.price(
        userId,
        "AI_TOKEN_USAGE",
        beforeTimestampUtc,
        mode,
        txn
      );

      if (typeof aiPrice !== "number" || isNaN(aiPrice)) {
        throw StorageError.priceCalculationFailed(
          userId,
          new Error(`Invalid AI price value returned: ${aiPrice}`)
        );
      }

      return sdkPrice + aiPrice;
    }
  );
}
