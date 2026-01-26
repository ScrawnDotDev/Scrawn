import { StorageError } from "../../../../errors/storage";
import { RequestSDKCall } from "../../../../events/RequestEvents/RequestSDKCall";
import { RequestAITokenUsage } from "../../../../events/RequestEvents/RequestAITokenUsage";
import { StorageAdapterFactory } from "../../../../factory";
import { type SqlRecord } from "../../../../interface/event/Event";
import { logger } from "../../../../errors/logger";

const OPERATION = "PriceRequestPayment";

export async function handlePriceRequestPayment(
  event_data: SqlRecord<"REQUEST_PAYMENT">
): Promise<number> {
  try {
    if (!event_data.userId) {
      throw StorageError.invalidData("Missing userId in REQUEST_PAYMENT event");
    }

    logger.logOperationInfo(
      OPERATION,
      "start",
      "Calculating price for REQUEST_PAYMENT",
      { userId: event_data.userId }
    );

    // Calculate SDK call price
    const sdkEvent = new RequestSDKCall(event_data.userId, null);
    const sdkStorageAdapter =
      await StorageAdapterFactory.getStorageAdapter(sdkEvent);

    if (!sdkStorageAdapter) {
      throw StorageError.unknown(
        new Error(
          "Storage adapter factory returned null or undefined for SDK calls"
        )
      );
    }

    const sdkPrice = await sdkStorageAdapter.price(sdkEvent.serialize());

    if (typeof sdkPrice !== "number" || isNaN(sdkPrice)) {
      throw StorageError.priceCalculationFailed(
        event_data.userId,
        new Error(`Invalid SDK price value returned: ${sdkPrice}`)
      );
    }

    logger.logOperationInfo(
      OPERATION,
      "sdk_price_calculated",
      "SDK call price calculated successfully",
      { userId: event_data.userId, sdkPrice }
    );

    // Calculate AI token usage price
    const aiEvent = new RequestAITokenUsage(event_data.userId, null);
    const aiStorageAdapter =
      await StorageAdapterFactory.getStorageAdapter(aiEvent);

    if (!aiStorageAdapter) {
      throw StorageError.unknown(
        new Error(
          "Storage adapter factory returned null or undefined for AI token usage"
        )
      );
    }

    const aiPrice = await aiStorageAdapter.price(aiEvent.serialize());

    if (typeof aiPrice !== "number" || isNaN(aiPrice)) {
      throw StorageError.priceCalculationFailed(
        event_data.userId,
        new Error(`Invalid AI price value returned: ${aiPrice}`)
      );
    }

    logger.logOperationInfo(
      OPERATION,
      "ai_price_calculated",
      "AI token usage price calculated successfully",
      { userId: event_data.userId, aiPrice }
    );

    // Sum both prices
    const totalPrice = sdkPrice + aiPrice;

    logger.logOperationInfo(
      OPERATION,
      "completed",
      "Total price calculated successfully",
      { userId: event_data.userId, sdkPrice, aiPrice, totalPrice }
    );

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
