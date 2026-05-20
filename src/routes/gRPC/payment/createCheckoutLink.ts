import type { sendUnaryData } from "@grpc/grpc-js";
import {
  CreateCheckoutLinkRequest,
  CreateCheckoutLinkResponse,
} from "../../../gen/payment/v1/payment_pb.js";
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
import { wideEventContextKey } from "../../../context/requestContext";
import type { UserId } from "../../../config/identifiers";
import { DateTime } from "luxon";
import { handleAddSession } from "../../../storage/db/postgres/helpers/sessions";
import { type ContextUnaryCall } from "../../../interface/types/context.ts";
import { getPostgresDB } from "../../../storage/db/postgres/db";
import { checkoutSessionsTable } from "../../../storage/db/postgres/schema";
import { eq, and, sql } from "drizzle-orm";

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

    const config = getPaymentProviderConfig();
    const validatedData = validateRequest(req);
    wideEventBuilder?.setUser(validatedData.userId);

    const db = getPostgresDB();

    const [existing] = await db
      .select()
      .from(checkoutSessionsTable)
      .where(
        and(
          eq(checkoutSessionsTable.userId, validatedData.userId),
          eq(checkoutSessionsTable.isCompleted, false),
          sql`${checkoutSessionsTable.createdAt} > now() - interval '24 hours'`
        )
      )
      .limit(1);

    if (existing) {
      const response = new CreateCheckoutLinkResponse();
      response.setCheckoutlink(existing.link);
      return callback?.(null, response);
    }

    const beforeTimestamp = DateTime.utc();
    const custom_price = await calculatePrice(
      validatedData.userId,
      beforeTimestamp,
      mode
    );
    wideEventBuilder?.setPaymentContext({ priceAmount: custom_price });

    const checkoutResult = await createCheckoutSession(
      config,
      custom_price,
      validatedData.userId,
      auth.apiKeyId,
      beforeTimestamp,
      mode
    );

    const sessionResult = await handleAddSession(
      validatedData.userId,
      checkoutResult.sessionId,
      beforeTimestamp,
      auth.apiKeyId,
      mode,
      checkoutResult.checkoutUrl
    );
    wideEventBuilder?.setPaymentContext({ sessionId: sessionResult.id });

    const proxyUrl = `${process.env.APP_URL}/checkout/${sessionResult.id}`;

    await db.execute(sql`
      INSERT INTO checkout_sessions (user_id, link)
      VALUES (${validatedData.userId}, ${proxyUrl})
      ON CONFLICT (user_id) WHERE is_completed = false
      DO UPDATE SET
        link = EXCLUDED.link,
        created_at = ${DateTime.utc().toISO()!}
    `);

    const response = new CreateCheckoutLinkResponse();
    response.setCheckoutlink(proxyUrl);
    callback?.(null, response);
  } catch (error) {
    callback?.(error as Error);
  }
}

function validateRequest(
  req: CreateCheckoutLinkRequest
): CreateCheckoutLinkSchemaType {
  try {
    const json = {
      userId: req.getUserid(),
    };
    return createCheckoutLinkSchema.parse(json);
  } catch (error) {
    throw formatZodError(error, (msg) => PaymentError.validationFailed(msg));
  }
}

async function calculatePrice(
  userId: UserId,
  beforeTimestamp: DateTime,
  mode: "production" | "test"
): Promise<number> {
  const price = await calculatePaymentPrice(userId, beforeTimestamp, mode);

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
  mode: "test" | "production"
): Promise<CheckoutResult> {
  const params: CheckoutParams = {
    customPrice,
    userId,
    apiKeyId,
  };

  const checkoutResult = await createProviderCheckout(config, params, mode);

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
