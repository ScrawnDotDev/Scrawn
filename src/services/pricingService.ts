import { StorageAdapterFactory } from "../factory/EventStorageAdapterFactory";
import { StorageError } from "../errors/storage";
import type { UserId } from "../config/identifiers";
import type { DateTime } from "luxon";
import type { AuthContext } from "../context/auth";
import { getPostgresDB } from "../storage/db/postgres/db";
import { executeInTransaction } from "../storage/adapter/postgres/handlers/addEventUtils";
import { ensureUserExists } from "../storage/db/postgres/helpers/users";
import {
  lockUserForBilling,
  getDatabaseNow,
} from "../storage/db/postgres/helpers/billing";

export interface PaymentPrice {
  price: number;
  /** Cutoff the price covers; store it as the session's billed_upto. */
  billedUpto: DateTime;
}

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

/**
 * Prices a user's unbilled usage up to "now". The user row is locked for the
 * duration so that no event can be stamped before the cutoff and committed
 * after it has been read (see storage/db/postgres/helpers/billing.ts).
 */
export async function calculatePaymentPrice(
  userId: UserId,
  auth: AuthContext
): Promise<PaymentPrice> {
  if (!userId) {
    throw StorageError.invalidData("Missing userId in PAYMENT price request");
  }

  return await executeInTransaction(
    getPostgresDB(),
    "calculating payment price",
    async (txn) => {
      await ensureUserExists(auth.projectId, userId, txn);
      await lockUserForBilling(auth.projectId, userId, txn);
      const billedUpto = await getDatabaseNow(txn);
      const price = await calculatePrices(userId, billedUpto, auth, txn);
      return { price, billedUpto };
    }
  );
}
