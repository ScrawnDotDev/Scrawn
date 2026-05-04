import DodoPayments from "dodopayments";
import { PaymentError } from "../../../errors/payment";

let client: DodoPayments | null = null;

export function getDodoClient(): DodoPayments {
  if (!client) {
    const apiKey = process.env.DODO_PAYMENTS_API_KEY;
    if (!apiKey) {
      throw PaymentError.missingApiKey();
    }
    client = new DodoPayments({
      bearerToken: apiKey,
      environment:
        process.env.NODE_ENV === "production" ? "live_mode" : "test_mode",
      webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_SIGNING_SECRET,
    });
  }
  return client;
}

export interface PaymentProviderConfig {
  productId: string;
  returnUrl: string;
}

export interface CheckoutParams {
  customPrice: number;
  userId: string;
  apiKeyId: string;
}

export interface CheckoutResult {
  sessionId: string;
  checkoutUrl: string;
}

export function getPaymentProviderConfig(): PaymentProviderConfig {
  const productId = process.env.DODO_PAYMENTS_PRODUCT_ID;
  const returnUrl = `${process.env.APP_URL}/checkout/success`;

  if (!productId) {
    throw PaymentError.missingProductId();
  }

  return { productId, returnUrl };
}

export async function createProviderCheckout(
  config: PaymentProviderConfig,
  params: CheckoutParams
): Promise<CheckoutResult> {
  const client = getDodoClient();

  const session = await client.checkoutSessions.create({
    product_cart: [
      {
        product_id: config.productId,
        quantity: 1,
        amount: params.customPrice,
      },
    ],
    metadata: {
      user_id: params.userId,
      api_key_id: params.apiKeyId,
    },
    return_url: config.returnUrl,
  });

  if (!session.checkout_url) {
    throw PaymentError.invalidCheckoutResponse(
      "No checkout URL returned from Dodo"
    );
  }

  if (!session.session_id) {
    throw PaymentError.invalidCheckoutResponse(
      "No session ID returned from Dodo"
    );
  }

  return {
    sessionId: session.session_id,
    checkoutUrl: session.checkout_url,
  };
}
