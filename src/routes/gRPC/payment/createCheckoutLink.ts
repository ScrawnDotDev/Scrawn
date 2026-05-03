import type {
  CreateCheckoutLinkRequest,
  CreateCheckoutLinkResponse,
} from "../../../gen/payment/v1/payment_pb";
import {
  CreateCheckoutLinkResponseSchema,
  CreateCheckoutLinkRequestSchema,
} from "../../../gen/payment/v1/payment_pb";
import {
  createCheckoutLinkSchema,
  type CreateCheckoutLinkSchemaType,
} from "../../../zod/payment";
import { PaymentError } from "../../../errors/payment";
import { AuthError } from "../../../errors/auth";
import { ZodError } from "zod";
import type { HandlerContext } from "@connectrpc/connect";
import type {
  PaymentProviderConfig,
  CheckoutParams,
} from "./paymentProvider.ts";
import {
  getPaymentProviderConfig,
  createProviderCheckout,
} from "./paymentProvider.ts";
import { StorageAdapterFactory } from "../../../factory";
import { apiKeyContextKey } from "../../../context/auth";
import { wideEventContextKey } from "../../../context/requestContext";
import { create } from "@bufbuild/protobuf";
import { toJson } from "@bufbuild/protobuf";
import type { UserId } from "../../../config/identifiers";

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
  const config = getPaymentProviderConfig();

  // Validate the incoming request
  const validatedData = validateRequest(req);
  wideEventBuilder?.setUser(validatedData.userId);

  // Payment provider is configured via paymentProvider.ts

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

function validateRequest(
  req: CreateCheckoutLinkRequest
): CreateCheckoutLinkSchemaType {
  try {
    const json = toJson(CreateCheckoutLinkRequestSchema, req);
    return createCheckoutLinkSchema.parse(json);
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

async function calculatePrice(userId: UserId): Promise<number> {
  const storageAdapter =
    await StorageAdapterFactory.getEventStorageAdapter("PAYMENT");

  if (!storageAdapter) {
    throw PaymentError.storageAdapterFailed("Storage adapter not available");
  }

  const price = await storageAdapter.price(userId, "PAYMENT");

  if (typeof price !== "number" || isNaN(price) || price < 0) {
    throw PaymentError.priceCalculationFailed(
      userId,
      new Error(`Invalid price: ${price}`)
    );
  }

  return price;
}

async function createCheckoutSession(
  config: PaymentProviderConfig,
  customPrice: number,
  userId: string,
  apiKeyId: string
): Promise<string> {
  const params: CheckoutParams = {
    customPrice,
    userId,
    apiKeyId,
  };

  const checkoutUrl = await createProviderCheckout(config, params);

  console.log(checkoutUrl);

  if (
    !checkoutUrl ||
    typeof checkoutUrl !== "string" ||
    checkoutUrl.trim().length === 0
  ) {
    throw PaymentError.invalidCheckoutResponse(
      "No valid checkout URL in response"
    );
  }

  try {
    new URL(checkoutUrl);
  } catch {
    throw PaymentError.invalidCheckoutResponse(
      `Invalid URL format: ${checkoutUrl}`
    );
  }

  return checkoutUrl;
}
