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
  validateUserId(userId);

  const [sdkPrice, aiPrice] = await Promise.all([
    handlePriceRequestSdkCall(userId, beforeTimestamp),
    handlePriceRequestAiTokenUsage(userId, beforeTimestamp),
  ]);

  return combinePrices(userId, sdkPrice, aiPrice);
}

function validateUserId(userId: UserId): void {
  if (!userId) {
    throw StorageError.invalidData("Missing userId in REQUEST_PAYMENT event");
  }
}

function combinePrices(userId: UserId, sdkPrice: number, aiPrice: number): number {
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
