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

export async function createCheckoutLink(
  req: CreateCheckoutLinkRequest,
  context: HandlerContext,
): Promise<CreateCheckoutLinkResponse> {
  try {
    const apiKeyId = context.values.get(apiKeyContextKey);
    if (!apiKeyId) {
      throw AuthError.invalidAPIKey("API key ID not found in context");
    }

    console.log(`[RegisterEvent] Authenticated with API Key ID: ${apiKeyId}`);

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
        console.error("[LemonSqueezy SDK Error]", error);
      },
    });

    // Get custom price from storage
    let custom_price: number;
    try {
      const storageAdapter = await StorageAdapterFactory.getStorageAdapter(
        new RequestPayment(validatedData.userId, null),
      );

      if (!storageAdapter) {
        throw PaymentError.storageAdapterFailed(
          "Storage adapter factory returned null or undefined",
        );
      }

      custom_price = await storageAdapter.price();

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
      console.error(
        `[CreateCheckoutLink] Failed to get price for user ${validatedData.userId}:`,
        error,
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
      console.error("[CreateCheckoutLink] Lemon Squeezy API call failed:");
      console.error("User ID:", validatedData.userId);
      console.error("Custom Price:", custom_price);
      console.error("Store ID:", LEMON_SQUEEZY_STORE_ID);
      console.error("Variant ID:", LEMON_SQUEEZY_VARIANT_ID);
      console.error("Error details:", error);

      let errorMessage = "Unknown error";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === "string") {
        errorMessage = error;
      } else if (error && typeof error === "object" && "message" in error) {
        errorMessage = String(error.message);
      }

      throw PaymentError.lemonSqueezyApiError(
        errorMessage,
        error instanceof Error ? error : new Error(String(error)),
      );
    }

    // Validate response from Lemon Squeezy with comprehensive checks
    if (!checkoutResponse) {
      console.error(
        "[CreateCheckoutLink] Received null or undefined checkout response",
      );
      throw PaymentError.invalidCheckoutResponse(
        "Checkout response is null or undefined",
      );
    }

    if (checkoutResponse.error) {
      console.error(
        "[CreateCheckoutLink] Checkout response contains error:",
        checkoutResponse.error,
      );
      const errorMsg =
        checkoutResponse.error?.message ||
        JSON.stringify(checkoutResponse.error);
      throw PaymentError.checkoutCreationFailed(errorMsg);
    }

    // Validate response structure
    if (!checkoutResponse.data) {
      console.error(
        "[CreateCheckoutLink] Missing 'data' field in checkout response:",
        checkoutResponse,
      );
      throw PaymentError.invalidCheckoutResponse(
        "Missing 'data' field in checkout response",
      );
    }

    if (!checkoutResponse.data.data) {
      console.error(
        "[CreateCheckoutLink] Missing nested 'data' field in checkout response:",
        checkoutResponse,
      );
      throw PaymentError.invalidCheckoutResponse(
        "Missing nested 'data' field in checkout response",
      );
    }

    if (!checkoutResponse.data.data.attributes) {
      console.error(
        "[CreateCheckoutLink] Missing 'attributes' field in checkout response:",
        checkoutResponse,
      );
      throw PaymentError.invalidCheckoutResponse(
        "Missing 'attributes' field in checkout response",
      );
    }

    const checkoutUrl = checkoutResponse.data.data.attributes.url;
    if (!checkoutUrl) {
      console.error(
        "[CreateCheckoutLink] Missing checkout URL in response attributes:",
        checkoutResponse.data.data.attributes,
      );
      throw PaymentError.invalidCheckoutResponse(
        "No checkout URL found in response attributes",
      );
    }

    if (typeof checkoutUrl !== "string" || checkoutUrl.trim().length === 0) {
      console.error(
        "[CreateCheckoutLink] Invalid checkout URL format:",
        checkoutUrl,
      );
      throw PaymentError.invalidCheckoutResponse(
        `Invalid checkout URL format: ${typeof checkoutUrl}`,
      );
    }

    // Validate URL format
    try {
      new URL(checkoutUrl);
    } catch (urlError) {
      console.error(
        "[CreateCheckoutLink] Checkout URL is not a valid URL:",
        checkoutUrl,
      );
      throw PaymentError.invalidCheckoutResponse(
        `Checkout URL is not a valid URL: ${checkoutUrl}`,
        urlError instanceof Error ? urlError : undefined,
      );
    }

    console.log(
      `[CreateCheckoutLink] Successfully created checkout URL for user ${validatedData.userId}`,
    );
    console.log(`[CreateCheckoutLink] Checkout URL: ${checkoutUrl}`);

    return create(CreateCheckoutLinkResponseSchema, {
      checkoutLink: checkoutUrl,
    });
  } catch (error) {
    console.error("=== CreateCheckoutLink Error ===");
    console.error("Error type:", error?.constructor?.name);
    console.error(
      "Error message:",
      error instanceof Error ? error.message : String(error),
    );
    console.error("Full error:", error);

    if (error instanceof Error && error.stack) {
      console.error("Stack trace:", error.stack);
    }

    // Re-throw PaymentError as-is
    // Use duck typing instead of instanceof to work with mocked modules
    if (
      error &&
      typeof error === "object" &&
      "type" in error &&
      "name" in error &&
      error.name === "PaymentError"
    ) {
      console.error(
        `[CreateCheckoutLink] PaymentError - Type: ${(error as PaymentError).type}, Message: ${(error as PaymentError).message}`,
      );
      throw error;
    }

    // Re-throw AuthError as-is
    if (error instanceof AuthError) {
      console.error(
        `[CreateCheckoutLink] AuthError - Message: ${error.message}`,
      );
      throw error;
    }

    // Wrap unexpected errors with context
    console.error(
      "[CreateCheckoutLink] Unexpected error occurred, wrapping in PaymentError.unknown",
    );
    throw PaymentError.unknown(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}
