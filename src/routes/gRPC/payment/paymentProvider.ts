import DodoPayments from "dodopayments";
import { PaymentError } from "../../../errors/payment";
import { getMetadata } from "../../../storage/db/postgres/helpers/metadata";

let liveClient: DodoPayments | null = null;
let testClient: DodoPayments | null = null;

function clearClients(): void {
  liveClient = null;
  testClient = null;
}

export async function getDodoClient(
  mode?: "test" | "production"
): Promise<DodoPayments> {
  if (!mode) {
    mode = process.env.NODE_ENV === "production" ? "production" : "test";
  }

  if (mode === "production") {
    if (liveClient) return liveClient;

    const metadata = await getMetadata();
    const apiKey = metadata?.dodo_live_api_key;
    if (!apiKey) {
      throw PaymentError.missingApiKey();
    }

    liveClient = new DodoPayments({
      bearerToken: apiKey,
      environment: "live_mode",
      webhookKey: metadata?.dodo_webhook_secret ?? undefined,
    });
    return liveClient;
  }

  if (testClient) return testClient;

  const metadata = await getMetadata();
  const apiKey = metadata?.dodo_test_api_key;
  if (!apiKey) {
    throw PaymentError.missingApiKey();
  }

  testClient = new DodoPayments({
    bearerToken: apiKey,
    environment: "test_mode",
    webhookKey: metadata?.dodo_webhook_secret ?? undefined,
  });
  return testClient;
}

// Re-export for callers who need to invalidate cached clients after onboarding updates
export { clearClients };

export interface PaymentProviderConfig {
  productId: string;
  returnUrl: string | null;
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

export async function getPaymentProviderConfig(): Promise<PaymentProviderConfig> {
  const metadata = await getMetadata();

  const productId = metadata?.dodo_product_id;
  const returnUrl = metadata?.redirect_url ?? null;

  if (!productId) {
    throw PaymentError.missingProductId();
  }

  return { productId, returnUrl };
}

export async function createProviderCheckout(
  config: PaymentProviderConfig,
  params: CheckoutParams,
  mode: "test" | "production"
): Promise<CheckoutResult> {
  const client = await getDodoClient(mode);

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
    ...(config.returnUrl ? { return_url: config.returnUrl } : {}),
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
