import { StorageError } from "../../../../errors/storage";
import { StorageAdapterFactory } from "../../../../factory";
import { type SqlRecord } from "../../../../interface/event/Event";
import type { UserId } from "../../../../config/identifiers";

export async function handlePriceRequestPayment(
  userId: UserId
): Promise<number> {
  try {
    if (!userId) {
      throw StorageError.invalidData("Missing userId in REQUEST_PAYMENT event");
    }

    // Calculate SDK call price
    const sdkStorageAdapter =
      await StorageAdapterFactory.getEventStorageAdapter("SDK_CALL");

    if (!sdkStorageAdapter) {
      throw StorageError.unknown(
        new Error(
          "Storage adapter factory returned null or undefined for SDK calls"
        )
      );
    }

    const sdkPrice = await sdkStorageAdapter.price(userId, "SDK_CALL");

    if (typeof sdkPrice !== "number" || isNaN(sdkPrice)) {
      throw StorageError.priceCalculationFailed(
        userId,
        new Error(`Invalid SDK price value returned: ${sdkPrice}`)
      );
    }

    // Calculate AI token usage price
    const aiStorageAdapter =
      await StorageAdapterFactory.getEventStorageAdapter("AI_TOKEN_USAGE");

    if (!aiStorageAdapter) {
      throw StorageError.unknown(
        new Error(
          "Storage adapter factory returned null or undefined for AI token usage"
        )
      );
    }

    const aiPrice = await aiStorageAdapter.price(userId, "AI_TOKEN_USAGE");

    if (typeof aiPrice !== "number" || isNaN(aiPrice)) {
      throw StorageError.priceCalculationFailed(
        userId,
        new Error(`Invalid AI price value returned: ${aiPrice}`)
      );
    }

    // Sum both prices
    const totalPrice = sdkPrice + aiPrice;
    return totalPrice;
  } catch (e) {
    // Use duck typing instead of instanceof to work with mocked modules
    if (
      e &&
      typeof e === "object" &&
      "type" in e &&
      (e as any).name === "StorageError"
    ) {
      throw e;
    }

    throw StorageError.priceCalculationFailed(
      "Failed to calculate price for REQUEST_PAYMENT event",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}
