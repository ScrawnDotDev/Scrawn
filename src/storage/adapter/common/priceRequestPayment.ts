import { StorageError } from "../../../errors/storage";
import type { UserId } from "../../../config/identifiers";
import type { DateTime } from "luxon";
import { StorageAdapterFactory } from "../../../factory/EventStorageAdapterFactory";

export async function handlePriceRequestPayment(
  userId: UserId,
  beforeTimestamp: DateTime,
  mode: "production" | "test"
): Promise<number> {
  try {
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
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "type" in e &&
      (e as any).name === "StorageError"
    ) {
      throw e;
    }

    throw StorageError.priceCalculationFailed(
      "Failed to calculate price for PAYMENT event",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}
