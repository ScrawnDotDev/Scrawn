import { STORAGE_ADAPTER } from "../config/identifiers";
import { StorageAdapterFactory } from "../factory/EventStorageAdapterFactory";
import { StorageError } from "../errors/storage";
import type { UserId } from "../config/identifiers";
import type { DateTime } from "luxon";
import type { AuthContext } from "../context/auth";
import { getPostgresDB } from "../storage/db/postgres/db";
import { executeInTransaction } from "../storage/adapter/postgres/handlers/addEventUtils";

async function calculatePrices(
  userId: UserId,
  beforeTimestampUtc: DateTime,
  auth: AuthContext,
  txn?: unknown
): Promise<number> {
  const adapter = await StorageAdapterFactory.getEventStorageAdapter();

  const [sdkPrice, aiPrice] = await Promise.all([
    adapter.price(userId, "BASIC_USAGE", beforeTimestampUtc, auth, txn),
    adapter.price(userId, "AI_TOKEN_USAGE", beforeTimestampUtc, auth, txn),
  ]);

  if (typeof sdkPrice !== "number" || isNaN(sdkPrice)) {
    throw StorageError.priceCalculationFailed(
      userId,
      new Error(`Invalid SDK price value returned: ${sdkPrice}`)
    );
  }

  if (typeof aiPrice !== "number" || isNaN(aiPrice)) {
    throw StorageError.priceCalculationFailed(
      userId,
      new Error(`Invalid AI price value returned: ${aiPrice}`)
    );
  }

  return sdkPrice + aiPrice;
}

export async function calculatePaymentPrice(
  userId: UserId,
  beforeTimestamp: DateTime,
  auth: AuthContext
): Promise<number> {
  const beforeTimestampUtc = beforeTimestamp.toUTC();

  if (!userId) {
    throw StorageError.invalidData("Missing userId in PAYMENT price request");
  }

  if (STORAGE_ADAPTER === "clickhouse") {
    return await calculatePrices(userId, beforeTimestampUtc, auth);
  }

  return await executeInTransaction(
    getPostgresDB(),
    "calculating payment price",
    async (txn) => calculatePrices(userId, beforeTimestampUtc, auth, txn)
  );
}
