import DodoPayments from "dodopayments";
import { PaymentError } from "../../../errors/payment";
import { getMetadata } from "../../../storage/db/postgres/helpers/metadata";
import { decrypt } from "../../../utils/encryptMetadata.ts";

// Per-project client caches: projectId → client
const liveClients = new Map<string, DodoPayments>();
const testClients = new Map<string, DodoPayments>();

export function clearClients(projectId?: string): void {
  if (projectId) {
    liveClients.delete(projectId);
    testClients.delete(projectId);
  } else {
    liveClients.clear();
    testClients.clear();
  }
}

export async function getDodoClient(
  mode: "test" | "production",
  projectId: string
): Promise<DodoPayments> {
  const cache = mode === "production" ? liveClients : testClients;
  const cached = cache.get(projectId);
  if (cached) return cached;

  const metadata = await getMetadata(projectId);
  const apiKey =
    mode === "production"
      ? metadata?.dodo_live_api_key
      : metadata?.dodo_test_api_key;

  if (!apiKey) {
    throw PaymentError.missingApiKey();
  }

  const webhookSecret =
    mode === "production"
      ? metadata?.dodo_live_webhook_secret
      : metadata?.dodo_test_webhook_secret;

  const client = new DodoPayments({
    bearerToken: decrypt(apiKey),
    environment: mode === "production" ? "live_mode" : "test_mode",
    webhookKey: webhookSecret ? decrypt(webhookSecret) : undefined,
  });

  cache.set(projectId, client);
  return client;
}

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
  projectId: string
): Promise<PaymentProviderConfig> {
  const metadata = await getMetadata(projectId);

  if (!metadata) {
    throw PaymentError.missingMetadata();
  }

  const productId =
    mode === "production"
      ? metadata.dodo_live_product_id
      : metadata.dodo_test_product_id;
  const returnUrl = metadata.redirect_url ?? null;

  if (!productId) {
    throw PaymentError.missingProductId();
  }

  return { productId, returnUrl, currency: metadata.currency };
}

export async function createProviderCheckout(
  config: PaymentProviderConfig,
  params: CheckoutParams,
  mode: "test" | "production",
  projectId: string
): Promise<CheckoutResult> {
  const client = await getDodoClient(mode, projectId);

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
