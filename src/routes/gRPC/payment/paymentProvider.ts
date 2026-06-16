import DodoPayments from "dodopayments";
import { PaymentError } from "../../../errors/payment";
import { getMetadata } from "../../../storage/db/postgres/helpers/metadata";
import { decrypt } from "../../../utils/encryptMetadata.ts";

const liveClients = new Map<string, DodoPayments>();
const testClients = new Map<string, DodoPayments>();

function clearClients(project_id?: string): void {
  if (project_id) {
    liveClients.delete(project_id);
    testClients.delete(project_id);
  } else {
    liveClients.clear();
    testClients.clear();
  }
}

export async function getDodoClient(
  mode: "test" | "production",
  project_id: string
): Promise<DodoPayments> {
  if (mode === "production") {
    const cached = liveClients.get(project_id);
    if (cached) return cached;

    const metadata = await getMetadata(project_id);
    const apiKey = metadata?.dodo_live_api_key;
    if (!apiKey) {
      throw PaymentError.missingApiKey();
    }

    const client = new DodoPayments({
      bearerToken: decrypt(apiKey),
      environment: "live_mode",
      webhookKey: metadata?.dodo_live_webhook_secret
        ? decrypt(metadata.dodo_live_webhook_secret)
        : undefined,
    });
    liveClients.set(project_id, client);
    return client;
  }

  const cached = testClients.get(project_id);
  if (cached) return cached;

  const metadata = await getMetadata(project_id);
  const apiKey = metadata?.dodo_test_api_key;
  if (!apiKey) {
    throw PaymentError.missingApiKey();
  }

  const client = new DodoPayments({
    bearerToken: decrypt(apiKey),
    environment: "test_mode",
    webhookKey: metadata?.dodo_test_webhook_secret
      ? decrypt(metadata.dodo_test_webhook_secret)
      : undefined,
  });
  testClients.set(project_id, client);
  return client;
}

// Re-export for callers who need to invalidate cached clients after onboarding updates
export { clearClients };

export interface PaymentProviderConfig {
  productId: string;
  returnUrl: string | null;
  currency: string;
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

export async function getPaymentProviderConfig(
  mode: "test" | "production",
  project_id: string
): Promise<PaymentProviderConfig> {
  const metadata = await getMetadata(project_id);

  if (!metadata) {
    throw PaymentError.missingMetadata();
  }

  const productId =
    mode === "production"
      ? metadata?.dodo_live_product_id
      : metadata?.dodo_test_product_id;
  const returnUrl = metadata?.redirect_url ?? null;

  if (!productId) {
    throw PaymentError.missingProductId();
  }

  return { productId, returnUrl, currency: metadata.currency };
}

export async function createProviderCheckout(
  config: PaymentProviderConfig,
  params: CheckoutParams,
  mode: "test" | "production",
  project_id: string
): Promise<CheckoutResult> {
  const client = await getDodoClient(mode, project_id);

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
    billing_currency:
      config.currency.toUpperCase() as import("dodopayments/resources/misc").Currency,
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
