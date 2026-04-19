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
import { wideEventContextKey } from "../../../context/requestContext";

export async function createCheckoutLink(
  req: CreateCheckoutLinkRequest,
  context: HandlerContext
): Promise<CreateCheckoutLinkResponse> {
  const wideEventBuilder = context.values.get(wideEventContextKey);

  const apiKeyId = context.values.get(apiKeyContextKey);
  if (!apiKeyId) {
    throw AuthError.invalidAPIKey("API key ID not found in context");
  }

  // Validate environment configuration
  const config = getConfig();

  // Validate the incoming request
  const validatedData = validateRequest(req);
  wideEventBuilder?.setUser(validatedData.userId);

  // Configure Lemon Squeezy SDK
  lemonSqueezySetup({ apiKey: config.apiKey });

  // Get custom price from storage
  const custom_price = await calculatePrice(validatedData.userId);
  wideEventBuilder?.setPaymentContext({ priceAmount: custom_price });

  // Create checkout session
  const checkoutUrl = await createCheckoutSession(
    config,
    custom_price,
    validatedData.userId,
    apiKeyId
  );

  return create(CreateCheckoutLinkResponseSchema, {
    checkoutLink: checkoutUrl,
  });
}

interface LemonSqueezyConfig {
  apiKey: string;
  storeId: string;
  variantId: string;
}

function getConfig(): LemonSqueezyConfig {
  const apiKey = process.env.LEMON_SQUEEZY_API_KEY;
  const storeId = process.env.LEMON_SQUEEZY_STORE_ID;
  const variantId = process.env.LEMON_SQUEEZY_VARIANT_ID;

  if (!apiKey) throw PaymentError.missingApiKey();
  if (!storeId) throw PaymentError.missingStoreId();
  if (!variantId) throw PaymentError.missingVariantId();

  return { apiKey, storeId, variantId };
}

function validateRequest(
  req: CreateCheckoutLinkRequest
): CreateCheckoutLinkSchemaType {
  try {
    return createCheckoutLinkSchema.parse(req);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      throw PaymentError.validationFailed(issues);
    }
    throw PaymentError.validationFailed(
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function calculatePrice(userId: string): Promise<number> {
  const event = new RequestPayment(userId, null);
  const storageAdapter = await StorageAdapterFactory.getStorageAdapter(event);

  if (!storageAdapter) {
    throw PaymentError.storageAdapterFailed("Storage adapter not available");
  }

  const price = await storageAdapter.price(event.serialize());

  if (typeof price !== "number" || isNaN(price) || price < 0) {
    throw PaymentError.priceCalculationFailed(
      userId,
      new Error(`Invalid price: ${price}`)
    );
  }

  return price;
}

async function createCheckoutSession(
  config: LemonSqueezyConfig,
  customPrice: number,
  userId: string,
  apiKeyId: string
): Promise<string> {
  const checkoutResponse = await createCheckout(
    config.storeId,
    config.variantId,
    {
      customPrice,
      checkoutData: {
        custom: {
          user_id: String(userId),
          api_key_id: String(apiKeyId),
        },
      },
    }
  );

  if (!checkoutResponse) {
    throw PaymentError.invalidCheckoutResponse("Response is null");
  }

  if (checkoutResponse.error) {
    throw PaymentError.checkoutCreationFailed(
      checkoutResponse.error?.message || JSON.stringify(checkoutResponse.error)
    );
  }

  const checkoutUrl = checkoutResponse.data?.data?.attributes?.url;

  if (
    !checkoutUrl ||
    typeof checkoutUrl !== "string" ||
    checkoutUrl.trim().length === 0
  ) {
    throw PaymentError.invalidCheckoutResponse(
      "No valid checkout URL in response"
    );
  }

  // Validate URL format
  try {
    new URL(checkoutUrl);
  } catch {
    throw PaymentError.invalidCheckoutResponse(
      `Invalid URL format: ${checkoutUrl}`
    );
  }

  return checkoutUrl;
}
