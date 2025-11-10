import { Code, ConnectError } from "@connectrpc/connect";

export enum PaymentErrorType {
  INVALID_USER_ID = "INVALID_USER_ID",
  CHECKOUT_CREATION_FAILED = "CHECKOUT_CREATION_FAILED",
  VALIDATION_FAILED = "VALIDATION_FAILED",
  LEMON_SQUEEZY_API_ERROR = "LEMON_SQUEEZY_API_ERROR",
  MISSING_API_KEY = "MISSING_API_KEY",
  MISSING_STORE_ID = "MISSING_STORE_ID",
  MISSING_VARIANT_ID = "MISSING_VARIANT_ID",
  UNKNOWN = "UNKNOWN",
}

export interface PaymentErrorContext {
  type: PaymentErrorType;
  message: string;
  originalError?: Error;
  code: Code;
}

export class PaymentError extends ConnectError {
  readonly type: PaymentErrorType;
  readonly originalError?: Error;

  constructor(context: PaymentErrorContext) {
    super(context.message, context.code);
    this.name = "PaymentError";
    this.type = context.type;
    this.originalError = context.originalError;

    Object.setPrototypeOf(this, PaymentError.prototype);
  }

  static invalidUserId(userId?: string, originalError?: Error): PaymentError {
    return new PaymentError({
      type: PaymentErrorType.INVALID_USER_ID,
      message: userId ? `Invalid user ID: ${userId}` : "Invalid user ID format",
      code: Code.InvalidArgument,
      originalError,
    });
  }

  static checkoutCreationFailed(details?: string, originalError?: Error): PaymentError {
    return new PaymentError({
      type: PaymentErrorType.CHECKOUT_CREATION_FAILED,
      message: details
        ? `Failed to create checkout link: ${details}`
        : "Failed to create checkout link",
      code: Code.Internal,
      originalError,
    });
  }

  static validationFailed(details: string, originalError?: Error): PaymentError {
    return new PaymentError({
      type: PaymentErrorType.VALIDATION_FAILED,
      message: `Payment validation failed: ${details}`,
      code: Code.InvalidArgument,
      originalError,
    });
  }

  static lemonSqueezyApiError(details?: string, originalError?: Error): PaymentError {
    return new PaymentError({
      type: PaymentErrorType.LEMON_SQUEEZY_API_ERROR,
      message: details
        ? `Lemon Squeezy API error: ${details}`
        : "Lemon Squeezy API error",
      code: Code.Internal,
      originalError,
    });
  }

  static missingApiKey(originalError?: Error): PaymentError {
    return new PaymentError({
      type: PaymentErrorType.MISSING_API_KEY,
      message: "Lemon Squeezy API key is not configured",
      code: Code.FailedPrecondition,
      originalError,
    });
  }

  static missingStoreId(originalError?: Error): PaymentError {
    return new PaymentError({
      type: PaymentErrorType.MISSING_STORE_ID,
      message: "Lemon Squeezy store ID is not configured",
      code: Code.FailedPrecondition,
      originalError,
    });
  }

  static missingVariantId(originalError?: Error): PaymentError {
    return new PaymentError({
      type: PaymentErrorType.MISSING_VARIANT_ID,
      message: "Lemon Squeezy variant ID is not configured",
      code: Code.FailedPrecondition,
      originalError,
    });
  }

  static unknown(originalError?: Error): PaymentError {
    return new PaymentError({
      type: PaymentErrorType.UNKNOWN,
      message: "An unknown payment processing error occurred",
      code: Code.Internal,
      originalError,
    });
  }
}
