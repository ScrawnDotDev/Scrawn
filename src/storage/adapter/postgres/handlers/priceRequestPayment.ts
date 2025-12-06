import { StorageError } from "../../../../errors/storage";
import { RequestSDKCall } from "../../../../events/RequestEvents/RequestSDKCall";
import { StorageAdapterFactory } from "../../../../factory";
import { type BaseEventMetadata } from "../../../../interface/event/Event";
import { type UserId } from "../../../../config/identifiers";
import { logger } from "../../../../errors/logger";

const OPERATION = "PriceRequestPayment";

export async function handlePriceRequestPayment(
  event_data: BaseEventMetadata<"REQUEST_PAYMENT"> & {
    userId: UserId;
  },
): Promise<number> {
  try {
    if (!event_data.userId) {
      throw StorageError.invalidData("Missing userId in REQUEST_PAYMENT event");
    }

    logger.logOperationInfo(
      OPERATION,
      "start",
      "Calculating price for REQUEST_PAYMENT",
      { userId: event_data.userId },
    );

    const storageAdapter = await StorageAdapterFactory.getStorageAdapter(
      new RequestSDKCall(event_data.userId, null),
    );

    if (!storageAdapter) {
      throw StorageError.unknown(
        new Error("Storage adapter factory returned null or undefined"),
      );
    }

    const price = await storageAdapter.price();

    if (typeof price !== "number" || isNaN(price)) {
      throw StorageError.priceCalculationFailed(
        event_data.userId,
        new Error(`Invalid price value returned: ${price}`),
      );
    }

    logger.logOperationInfo(
      OPERATION,
      "completed",
      "Price calculated successfully",
      { userId: event_data.userId, price },
    );

    return price;
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
      e instanceof Error ? e : new Error(String(e)),
    );
  }
}
