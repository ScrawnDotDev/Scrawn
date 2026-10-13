import type { sendUnaryData } from "@grpc/grpc-js";
import {
  CreateCheckoutLinkRequest,
  CreateCheckoutLinkResponse,
} from "../../../gen/payment/v1/payment.ts";
import {
  createCheckoutLinkSchema,
  type CreateCheckoutLinkSchemaType,
} from "../../../zod/payment";
import { PaymentError } from "../../../errors/payment";
import { AuthError } from "../../../errors/auth";
import { formatZodError } from "../../../utils/formatZodError";
import type {
  PaymentProviderConfig,
  CheckoutParams,
} from "./paymentProvider.ts";
import {
  getPaymentProviderConfig,
  getDodoClient,
  createProviderCheckout,
  type CheckoutResult,
} from "./paymentProvider.ts";
import {
  calculatePaymentPrice,
  type PaymentPrice,
} from "../../../services/pricingService";
import { apiKeyContextKey } from "../../../context/auth";
import type { AuthContext } from "../../../context/auth";
import { wideEventContextKey } from "../../../context/requestContext";
import type { UserId } from "../../../config/identifiers";
import { executeInTransaction } from "../../../storage/adapter/postgres/handlers/addEventUtils";
import { DateTime } from "luxon";
import { handleAddSession } from "../../../storage/db/postgres/helpers/sessions";
import { type ContextUnaryCall } from "../../../interface/types/context.ts";
import { getPostgresDB } from "../../../storage/db/postgres/db";
import { checkIfExistingCheckoutLink } from "../../../storage/db/postgres/helpers/sessions";
import { ensureUserExists } from "../../../storage/db/postgres/helpers/users";
import { usersTable } from "../../../storage/db/postgres/schema";
import { eq, and } from "drizzle-orm";

export async function createCheckoutLink(
  call: ContextUnaryCall<CreateCheckoutLinkRequest, CreateCheckoutLinkResponse>,
  callback?: sendUnaryData<CreateCheckoutLinkResponse>
): Promise<void> {
  const c = call;
  const req = c.request;
  const wideEventBuilder = call[wideEventContextKey];

  try {
    const auth = call[apiKeyContextKey];
    if (!auth) {
      return callback?.(AuthError.invalidAPIKey("API key context not found"));
    }

    if (auth.role === "dashboard") {
      return callback?.(
        AuthError.permissionDenied(
          "Dashboard keys cannot create checkout links"
        )
      );
    }

    if (!auth.mode) {
      return callback?.(
        AuthError.permissionDenied("Auth mode not set on API key")
      );
    }

    const mode = auth.mode;

    const config = await getPaymentProviderConfig(auth.projectId, mode);
    const validatedData = validateRequest(req);
    wideEventBuilder?.setUser(validatedData.userId);

    const db = getPostgresDB();

    // The cutoff comes from pricing itself so it matches exactly what was
    // summed; it becomes the session's billed_upto.
    const { price: custom_price, billedUpto: beforeTimestamp } =
      await calculatePrice(validatedData.userId, auth);
    wideEventBuilder?.setPaymentContext({ priceAmount: custom_price });

    // Load (and cache) the provider client before opening the transaction:
    // on a cache miss it reads project metadata from the pool, which must not
    // happen while this request already holds a pooled connection.
    await getDodoClient(auth.projectId, mode);

    const checkoutLink = await executeInTransaction(
      db,
      "create checkout link",
      async (txn) => {
        await ensureUserExists(auth.projectId, validatedData.userId, txn);

        await txn
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(
            and(
              eq(usersTable.projectId, auth.projectId),
              eq(usersTable.id, validatedData.userId)
            )
          )
          .for("update");

        const existingId = await checkIfExistingCheckoutLink(
          txn,
          auth.projectId,
          validatedData.userId,
          mode
        );

        if (existingId) {
          const proxyUrl = `${process.env.APP_URL}/checkout/${existingId}`;
          return proxyUrl;
        }

        const checkoutResult = await createCheckoutSession(
          auth.projectId,
          config,
          custom_price,
          validatedData.userId,
          auth.apiKeyId,
          beforeTimestamp,
          mode
        );

        const sessionResult = await handleAddSession(
          auth.projectId,
          validatedData.userId,
          checkoutResult.sessionId,
          beforeTimestamp,
          auth.apiKeyId,
          mode,
          checkoutResult.checkoutUrl,
          txn
        );
        wideEventBuilder?.setPaymentContext({ sessionId: sessionResult.id });

        const proxyUrl = `${process.env.APP_URL}/checkout/${sessionResult.id}`;
        return proxyUrl;
      }
    );

    callback?.(null, CreateCheckoutLinkResponse.create({ checkoutLink }));
  } catch (error) {
    callback?.(error as Error);
  }
}

function validateRequest(
  req: CreateCheckoutLinkRequest
): CreateCheckoutLinkSchemaType {
  try {
    const json = {
      userId: req.userId,
    };
    return createCheckoutLinkSchema.parse(json);
  } catch (error) {
    throw formatZodError(error, (msg) => PaymentError.validationFailed(msg));
  }
}

async function calculatePrice(
  userId: UserId,
  auth: AuthContext
): Promise<PaymentPrice> {
  const result = await calculatePaymentPrice(userId, auth);
  const price = result.price;

  if (typeof price !== "number" || isNaN(price) || price < 0) {
    throw PaymentError.priceCalculationFailed(
      userId,
      new Error(`Invalid price: ${price}`)
    );
  }

  return result;
}

async function createCheckoutSession(
  projectId: string,
  config: PaymentProviderConfig,
  customPrice: number,
  userId: string,
  apiKeyId: string,
  beforeTimestamp: DateTime,
  mode: "test" | "production"
): Promise<CheckoutResult> {
  const params: CheckoutParams = {
    customPrice,
    userId,
    apiKeyId,
  };

  const checkoutResult = await createProviderCheckout(
    projectId,
    config,
    params,
    mode
  );

  if (
    !checkoutResult.checkoutUrl ||
    typeof checkoutResult.checkoutUrl !== "string" ||
    checkoutResult.checkoutUrl.trim().length === 0
  ) {
    throw PaymentError.invalidCheckoutResponse(
      "No valid checkout URL in response"
    );
  }

  try {
    new URL(checkoutResult.checkoutUrl);
  } catch {
    throw PaymentError.invalidCheckoutResponse(
      `Invalid URL format: ${checkoutResult.checkoutUrl}`
    );
  }

  return checkoutResult;
}
