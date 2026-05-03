import DodoPayments from "dodopayments";
import { PaymentError } from "../../../errors/payment";

let client: DodoPayments | null = null;

function getClient(): DodoPayments {
  if (!client) {
    const apiKey = process.env.DODO_PAYMENTS_API_KEY;
    if (!apiKey) {
      throw PaymentError.missingApiKey();
    }
    client = new DodoPayments({
      bearerToken: apiKey,
      environment:
        process.env.NODE_ENV === "production" ? "live_mode" : "test_mode",
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
): Promise<string> {
  const client = getClient();

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

  return session.checkout_url;
}
