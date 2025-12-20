import type {
  CreateCheckoutLinkRequest,
  CreateCheckoutLinkResponse,
} from "../../../gen/payment/v1/payment_pb";
import { CreateCheckoutLinkResponseSchema } from "../../../gen/payment/v1/payment_pb";
import { create } from "@bufbuild/protobuf";
import {
  createCheckoutLinkSchema,
  type CreateCheckoutLinkSchemaType,
} from "../../../zod/payment";
import { PaymentError } from "../../../errors/payment";
import { AuthError } from "../../../errors/auth";
import { ZodError } from "zod";
import type { HandlerContext } from "@connectrpc/connect";
import {
  lemonSqueezySetup,
  createCheckout,
} from "@lemonsqueezy/lemonsqueezy.js";
import { StorageAdapterFactory } from "../../../factory";
import { RequestPayment } from "../../../events/RequestEvents/RequestPayment";
import { apiKeyContextKey } from "../../../context/auth";
import { logger } from "../../../errors/logger";

const OPERATION = "CreateCheckoutLink";

export async function createCheckoutLink(
  req: CreateCheckoutLinkRequest,
  context: HandlerContext,
): Promise<CreateCheckoutLinkResponse> {
  try {
    const apiKeyId = context.values.get(apiKeyContextKey);
    if (!apiKeyId) {
      throw AuthError.invalidAPIKey("API key ID not found in context");
    }

    logger.logOperationInfo(
      OPERATION,
      "authenticated",
      "Request authenticated",
      {
        apiKeyId,
      },
    );

    // Read environment configuration
    const LEMON_SQUEEZY_API_KEY = process.env.LEMON_SQUEEZY_API_KEY;
    const LEMON_SQUEEZY_STORE_ID = process.env.LEMON_SQUEEZY_STORE_ID;
    const LEMON_SQUEEZY_VARIANT_ID = process.env.LEMON_SQUEEZY_VARIANT_ID;

    // Validate environment configuration
    if (!LEMON_SQUEEZY_API_KEY) {
      throw PaymentError.missingApiKey();
    }

    if (!LEMON_SQUEEZY_STORE_ID) {
      throw PaymentError.missingStoreId();
    }

    if (!LEMON_SQUEEZY_VARIANT_ID) {
      throw PaymentError.missingVariantId();
    }

    // Validate the incoming request against the schema
    let validatedData: CreateCheckoutLinkSchemaType;
    try {
      validatedData = createCheckoutLinkSchema.parse(req);
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ");
        throw PaymentError.validationFailed(issues, error);
      }
      throw PaymentError.validationFailed(
        "Unknown validation error",
        error as Error,
      );
    }

    // Configure Lemon Squeezy SDK
    lemonSqueezySetup({
      apiKey: LEMON_SQUEEZY_API_KEY,
      onError: (error) => {
        logger.logOperationError(
          OPERATION,
          "lemon_squeezy_sdk",
          "LEMON_SQUEEZY_SDK_ERROR",
          "Lemon Squeezy SDK error",
          error as Error,
          {},
        );
      },
    });

    logger.logOperationInfo(OPERATION, "validated", "Request validated", {
      userId: validatedData.userId,
      apiKeyId,
    });

    // Get custom price from storage
    let custom_price: number;
    try {
      const event = new RequestPayment(validatedData.userId, null);
      const storageAdapter =
        await StorageAdapterFactory.getStorageAdapter(event);

      if (!storageAdapter) {
        throw PaymentError.storageAdapterFailed(
          "Storage adapter factory returned null or undefined",
        );
      }

      custom_price = await storageAdapter.price(event.serialize());

      if (
        typeof custom_price !== "number" ||
        isNaN(custom_price) ||
        custom_price <= 0
      ) {
        throw PaymentError.priceCalculationFailed(
          validatedData.userId,
          new Error(`Invalid price value: ${custom_price}`),
        );
      }
    } catch (error) {
      logger.logOperationError(
        OPERATION,
        "fetch_price",
        "PRICE_CALCULATION_FAILED",
        "Failed to calculate price",
        error as Error,
        { userId: validatedData.userId, apiKeyId },
      );

      // Use duck typing instead of instanceof to work with mocked modules
      if (
        error &&
        typeof error === "object" &&
        "type" in error &&
        (error as any).name === "PaymentError"
      ) {
        throw error;
      }

      throw PaymentError.priceCalculationFailed(
        validatedData.userId,
        error as Error,
      );
    }

    logger.logOperationInfo(OPERATION, "price_resolved", "Price calculated", {
      userId: validatedData.userId,
      price: custom_price,
      apiKeyId,
    });

    // Create checkout session
    // Create checkout session with detailed error context
    let checkoutResponse;
    try {
      checkoutResponse = await createCheckout(
        LEMON_SQUEEZY_STORE_ID,
        LEMON_SQUEEZY_VARIANT_ID,
        {
          customPrice: custom_price,
          checkoutData: {
            custom: {
              user_id: String(validatedData.userId),
              api_key_id: String(apiKeyId),
            },
          },
        },
      );
    } catch (error) {
      let errorMessage = "Unknown error";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === "string") {
        errorMessage = error;
      } else if (error && typeof error === "object" && "message" in error) {
        errorMessage = String(error.message);
      }

      logger.logOperationError(
        OPERATION,
        "create_checkout",
        "LEMON_SQUEEZY_API_ERROR",
        "Lemon Squeezy API call failed",
        error instanceof Error ? error : new Error(errorMessage),
        {
          userId: validatedData.userId,
          apiKeyId,
          price: custom_price,
          storeId: LEMON_SQUEEZY_STORE_ID,
          variantId: LEMON_SQUEEZY_VARIANT_ID,
        },
      );

      throw PaymentError.lemonSqueezyApiError(
        errorMessage,
        error instanceof Error ? error : new Error(String(error)),
      );
    }

    // Validate response from Lemon Squeezy with comprehensive checks
    if (!checkoutResponse) {
      throw PaymentError.invalidCheckoutResponse(
        "Checkout response is null or undefined",
      );
    }

    if (checkoutResponse.error) {
      const errorMsg =
        checkoutResponse.error?.message ||
        JSON.stringify(checkoutResponse.error);
      throw PaymentError.checkoutCreationFailed(errorMsg);
    }

    // Validate response structure
    if (!checkoutResponse.data) {
      throw PaymentError.invalidCheckoutResponse(
        "Missing 'data' field in checkout response",
      );
    }

    if (!checkoutResponse.data.data) {
      throw PaymentError.invalidCheckoutResponse(
        "Missing nested 'data' field in checkout response",
      );
    }

    if (!checkoutResponse.data.data.attributes) {
      throw PaymentError.invalidCheckoutResponse(
        "Missing 'attributes' field in checkout response",
      );
    }

    const checkoutUrl = checkoutResponse.data.data.attributes.url;
    if (!checkoutUrl) {
      throw PaymentError.invalidCheckoutResponse(
        "No checkout URL found in response attributes",
      );
    }

    if (typeof checkoutUrl !== "string" || checkoutUrl.trim().length === 0) {
      throw PaymentError.invalidCheckoutResponse(
        `Invalid checkout URL format: ${typeof checkoutUrl}`,
      );
    }

    // Validate URL format
    try {
      new URL(checkoutUrl);
    } catch (urlError) {
      throw PaymentError.invalidCheckoutResponse(
        `Checkout URL is not a valid URL: ${checkoutUrl}`,
        urlError instanceof Error ? urlError : undefined,
      );
    }

    logger.logOperationInfo(
      OPERATION,
      "completed",
      "Checkout link created successfully",
      { userId: validatedData.userId, apiKeyId, checkoutUrl },
    );

    return create(CreateCheckoutLinkResponseSchema, {
      checkoutLink: checkoutUrl,
    });
  } catch (error) {
    const apiKeyId = context.values.get(apiKeyContextKey);

    logger.logOperationError(
      OPERATION,
      "failed",
      error instanceof PaymentError
        ? error.type
        : error instanceof AuthError
          ? error.type
          : "UNKNOWN",
      "CreateCheckoutLink handler failed",
      error instanceof Error ? error : undefined,
      { apiKeyId },
    );

    // Re-throw PaymentError as-is
    // Use duck typing instead of instanceof to work with mocked modules
    if (
      error &&
      typeof error === "object" &&
      "type" in error &&
      "name" in error &&
      error.name === "PaymentError"
    ) {
      throw error;
    }

    // Re-throw AuthError as-is
    if (error instanceof AuthError) {
      throw error;
    }

    // Wrap unexpected errors with context
    throw PaymentError.unknown(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}
