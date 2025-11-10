import type {
  CreateCheckoutLinkRequest,
  CreateCheckoutLinkResponse,
} from "../../gen/payment/v1/payment_pb";
import { CreateCheckoutLinkResponseSchema } from "../../gen/payment/v1/payment_pb";
import { create } from "@bufbuild/protobuf";
import {
  createCheckoutLinkSchema,
  type CreateCheckoutLinkSchemaType,
} from "../../zod/payment";
import { PaymentError } from "../../errors/payment";
import { AuthError } from "../../errors/auth";
import { ZodError } from "zod";
import type { HandlerContext } from "@connectrpc/connect";
import {
  lemonSqueezySetup,
  createCheckout,
} from "@lemonsqueezy/lemonsqueezy.js";

const LEMON_SQUEEZY_API_KEY = process.env.LEMON_SQUEEZY_API_KEY;
const LEMON_SQUEEZY_STORE_ID = process.env.LEMON_SQUEEZY_STORE_ID;
const LEMON_SQUEEZY_VARIANT_ID = process.env.LEMON_SQUEEZY_VARIANT_ID;

export async function createCheckoutLink(
  req: CreateCheckoutLinkRequest,
  context: HandlerContext,
): Promise<CreateCheckoutLinkResponse> {
  try {
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

    // Create checkout session
    let checkoutResponse;
    try {
      checkoutResponse = await createCheckout(
        LEMON_SQUEEZY_STORE_ID,
        LEMON_SQUEEZY_VARIANT_ID,
        {
          customPrice: 30010,
          checkoutData: {
            custom: {
              user_id: String(validatedData.userId),
            },
          },
        },
      );

    } catch (error) {
      console.error("[CreateCheckoutLink] Lemon Squeezy API call failed:");
      console.error("Error details:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw PaymentError.lemonSqueezyApiError(errorMessage, error as Error);
    }

    // Validate response from Lemon Squeezy
    if (!checkoutResponse || checkoutResponse.error) {
      throw PaymentError.checkoutCreationFailed(
        checkoutResponse?.error?.message || "No checkout URL returned",
      );
    }

    const checkoutUrl = checkoutResponse.data?.data.attributes.url;
    if (!checkoutUrl) {
      throw PaymentError.checkoutCreationFailed("No checkout URL in response");
    }

    return create(CreateCheckoutLinkResponseSchema, {
      checkoutLink: checkoutUrl,
    });
  } catch (error) {
    console.error("=== CreateCheckoutLink Error ===");
    console.error("Error:", error);

    // Re-throw PaymentError as-is
    if (error instanceof PaymentError) {
      throw error;
    }

    // Re-throw AuthError as-is
    if (error instanceof AuthError) {
      throw error;
    }

    // Wrap unexpected errors
    throw PaymentError.unknown(error as Error);
  }
}
