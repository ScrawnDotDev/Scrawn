import { status as Status } from "@grpc/grpc-js";

enum PaymentErrorType {
  VALIDATION_FAILED = "VALIDATION_FAILED",
  MISSING_API_KEY = "MISSING_API_KEY",
  MISSING_PRODUCT_ID = "MISSING_PRODUCT_ID",
  INVALID_CHECKOUT_RESPONSE = "INVALID_CHECKOUT_RESPONSE",
  PRICE_CALCULATION_FAILED = "PRICE_CALCULATION_FAILED",
}

export interface PaymentErrorContext {
  type: PaymentErrorType;
  message: string;
  originalError?: Error;
  code: Status;
}

export class PaymentError extends Error {
  readonly type: PaymentErrorType;
  readonly originalError?: Error;
  readonly code: Status;

  constructor(context: PaymentErrorContext) {
    super(context.message);
    this.name = "PaymentError";
    this.type = context.type;
    this.originalError = context.originalError;
    this.code = context.code;
  }

  static validationFailed(
    details: string,
    originalError?: Error
  ): PaymentError {
    return new PaymentError({
      type: PaymentErrorType.VALIDATION_FAILED,
      message: `Payment validation failed: ${details}`,
      code: Status.INVALID_ARGUMENT,
      originalError,
    });
  }

  static missingApiKey(originalError?: Error): PaymentError {
    return new PaymentError({
      type: PaymentErrorType.MISSING_API_KEY,
      message: "Payment provider API key is not configured",
      code: Status.FAILED_PRECONDITION,
      originalError,
    });
  }

  static missingProductId(originalError?: Error): PaymentError {
    return new PaymentError({
      type: PaymentErrorType.MISSING_PRODUCT_ID,
      message: "Dodo product ID is not configured",
      code: Status.FAILED_PRECONDITION,
      originalError,
    });
  }

  static invalidCheckoutResponse(
    details?: string,
    originalError?: Error
  ): PaymentError {
    return new PaymentError({
      type: PaymentErrorType.INVALID_CHECKOUT_RESPONSE,
      message: details
        ? `Invalid checkout response: ${details}`
        : "Invalid checkout response from payment provider",
      code: Status.INTERNAL,
      originalError,
    });
  }

  static priceCalculationFailed(
    userId?: string,
    originalError?: Error
  ): PaymentError {
    return new PaymentError({
      type: PaymentErrorType.PRICE_CALCULATION_FAILED,
      message: userId
        ? `Failed to calculate price for user: ${userId}`
        : "Failed to calculate checkout price",
      code: Status.INTERNAL,
      originalError,
    });
  }
}
