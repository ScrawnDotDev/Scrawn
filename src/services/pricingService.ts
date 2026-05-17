import { StorageAdapterFactory } from "../factory/EventStorageAdapterFactory";
import { StorageError } from "../errors/storage";
import type { UserId } from "../config/identifiers";
import type { DateTime } from "luxon";

export async function calculatePaymentPrice(
  userId: UserId,
  beforeTimestamp: DateTime,
  mode: "production" | "test"
): Promise<number> {
  if (!userId) {
    throw StorageError.invalidData("Missing userId in PAYMENT price request");
  }

  const sdkAdapter =
    await StorageAdapterFactory.getEventStorageAdapter("BASIC_USAGE");
  const sdkPrice = await sdkAdapter.price(
    userId,
    "BASIC_USAGE",
    beforeTimestamp,
    mode
  );

  if (typeof sdkPrice !== "number" || isNaN(sdkPrice)) {
    throw StorageError.priceCalculationFailed(
      userId,
      new Error(`Invalid SDK price value returned: ${sdkPrice}`)
    );
  }

  const aiAdapter =
    await StorageAdapterFactory.getEventStorageAdapter("AI_TOKEN_USAGE");
  const aiPrice = await aiAdapter.price(
    userId,
    "AI_TOKEN_USAGE",
    beforeTimestamp,
    mode
  );

  if (typeof aiPrice !== "number" || isNaN(aiPrice)) {
    throw StorageError.priceCalculationFailed(
      userId,
      new Error(`Invalid AI price value returned: ${aiPrice}`)
    );
  }

  const totalPrice = sdkPrice + aiPrice;
  return totalPrice;
}
