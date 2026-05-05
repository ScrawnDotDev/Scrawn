import { StorageError } from "../../../../errors/storage";
import { type SqlRecord } from "../../../../interface/event/Event";
import type { UserId } from "../../../../config/identifiers";
import type { DateTime } from "luxon";
import { handlePriceRequestSdkCall } from "./priceRequestSdkCall";
import { handlePriceRequestAiTokenUsage } from "./priceRequestAiTokenUsage";

export async function handlePriceRequestPayment(
  userId: UserId,
  beforeTimestamp: DateTime
): Promise<number> {
  try {
    if (!userId) {
      throw StorageError.invalidData("Missing userId in REQUEST_PAYMENT event");
    }

    const sdkPrice = await handlePriceRequestSdkCall(userId, beforeTimestamp);

    if (typeof sdkPrice !== "number" || isNaN(sdkPrice)) {
      throw StorageError.priceCalculationFailed(
        userId,
        new Error(`Invalid SDK price value returned: ${sdkPrice}`)
      );
    }

    const aiPrice = await handlePriceRequestAiTokenUsage(userId, beforeTimestamp);

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
      "Failed to calculate price for REQUEST_PAYMENT event",
      e instanceof Error ? e : new Error(String(e))
    );
  }
}
