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
  createProviderCheckout,
  type CheckoutResult,
} from "./paymentProvider.ts";
import { calculatePaymentPrice } from "../../../services/pricingService";
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
import { eq } from "drizzle-orm";

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
    const project_id = auth.project_id;

    const config = await getPaymentProviderConfig(mode, project_id);
    const validatedData = validateRequest(req);
    wideEventBuilder?.setUser(validatedData.userId);

    const db = getPostgresDB();

    const beforeTimestamp = DateTime.utc();

    const custom_price = await calculatePrice(
      validatedData.userId,
      beforeTimestamp,
      auth
    );
    wideEventBuilder?.setPaymentContext({ priceAmount: custom_price });

    const checkoutResult = await createCheckoutSession(
      config,
      custom_price,
      validatedData.userId,
      auth.apiKeyId,
      beforeTimestamp,
      mode,
      project_id
    );

    const checkoutLink = await executeInTransaction(
      db,
      "create checkout link",
      async (txn) => {
        await ensureUserExists(validatedData.userId, project_id, txn);

        await txn
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.id, validatedData.userId))
          .for("update");

        const existingId = await checkIfExistingCheckoutLink(
          txn,
          validatedData.userId,
          mode,
          project_id
        );

        if (existingId) {
          const proxyUrl = `${process.env.APP_URL}/checkout/${existingId}`;
          return proxyUrl;
        }

        const sessionResult = await handleAddSession(
          validatedData.userId,
          checkoutResult.sessionId,
          beforeTimestamp,
          auth.apiKeyId,
          mode,
          checkoutResult.checkoutUrl,
          project_id,
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
  beforeTimestamp: DateTime,
  auth: AuthContext
): Promise<number> {
  const price = await calculatePaymentPrice(userId, beforeTimestamp, auth);

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
  apiKeyId: string,
  beforeTimestamp: DateTime,
  mode: "test" | "production",
  project_id: string
): Promise<CheckoutResult> {
  const params: CheckoutParams = {
    customPrice,
    userId,
    apiKeyId,
  };

  const checkoutResult = await createProviderCheckout(
    config,
    params,
    mode,
    project_id
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
