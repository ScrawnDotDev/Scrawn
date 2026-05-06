import { status as Status } from "@grpc/grpc-js";

enum PaymentErrorType {
  INVALID_USER_ID = "INVALID_USER_ID",
  CHECKOUT_CREATION_FAILED = "CHECKOUT_CREATION_FAILED",
  VALIDATION_FAILED = "VALIDATION_FAILED",
  PAYMENT_PROVIDER_API_ERROR = "PAYMENT_PROVIDER_API_ERROR",
  MISSING_API_KEY = "MISSING_API_KEY",
  MISSING_STORE_ID = "MISSING_STORE_ID",
  MISSING_VARIANT_ID = "MISSING_VARIANT_ID",
  MISSING_PRODUCT_ID = "MISSING_PRODUCT_ID",
  INVALID_CHECKOUT_RESPONSE = "INVALID_CHECKOUT_RESPONSE",
  PRICE_CALCULATION_FAILED = "PRICE_CALCULATION_FAILED",
  STORAGE_ADAPTER_FAILED = "STORAGE_ADAPTER_FAILED",
  CONFIGURATION_ERROR = "CONFIGURATION_ERROR",
  UNKNOWN = "UNKNOWN",
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

  // fallow-ignore-next-line unused-class-member
  static invalidUserId(userId?: string, originalError?: Error): PaymentError {
    return new PaymentError({
      type: PaymentErrorType.INVALID_USER_ID,
      message: userId ? `Invalid user ID: ${userId}` : "Invalid user ID format",
      code: Status.INVALID_ARGUMENT,
      originalError,
    });
  }

  // fallow-ignore-next-line unused-class-member
  static checkoutCreationFailed(
    details?: string,
    originalError?: Error
  ): PaymentError {
    return new PaymentError({
      type: PaymentErrorType.CHECKOUT_CREATION_FAILED,
      message:
        details !== undefined
          ? `Failed to create checkout link: ${details}`
          : "Failed to create checkout link",
      code: Status.INTERNAL,
      originalError,
    });
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

  // fallow-ignore-next-line unused-class-members
  // fallow-ignore-next-line unused-class-member
  static paymentProviderApiError(
    details?: string,
    originalError?: Error
  ): PaymentError {
    return new PaymentError({
      type: PaymentErrorType.PAYMENT_PROVIDER_API_ERROR,
      message: details
        ? `Payment provider API error: ${details}`
        : "Payment provider API error",
      code: Status.INTERNAL,
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

  // fallow-ignore-next-line unused-class-members
  // fallow-ignore-next-line unused-class-member
  static missingStoreId(originalError?: Error): PaymentError {
    return new PaymentError({
      type: PaymentErrorType.MISSING_STORE_ID,
      message: "Payment provider store ID is not configured",
      code: Status.FAILED_PRECONDITION,
      originalError,
    });
  }

  // fallow-ignore-next-line unused-class-members
  // fallow-ignore-next-line unused-class-member
  static missingVariantId(originalError?: Error): PaymentError {
    return new PaymentError({
      type: PaymentErrorType.MISSING_VARIANT_ID,
      message: "Payment provider variant ID is not configured",
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

  static storageAdapterFailed(
    details?: string,
    originalError?: Error
  ): PaymentError {
    return new PaymentError({
      type: PaymentErrorType.STORAGE_ADAPTER_FAILED,
      message: details
        ? `Storage adapter error: ${details}`
        : "Failed to retrieve data from storage",
      code: Status.INTERNAL,
      originalError,
    });
  }

  // fallow-ignore-next-line unused-class-member
  static configurationError(
    details?: string,
    originalError?: Error
  ): PaymentError {
    return new PaymentError({
      type: PaymentErrorType.CONFIGURATION_ERROR,
      message: details
        ? `Payment configuration error: ${details}`
        : "Payment system is not configured correctly",
      code: Status.FAILED_PRECONDITION,
      originalError,
    });
  }

  // fallow-ignore-next-line unused-class-member
  static unknown(originalError?: Error): PaymentError {
    const details = originalError?.message || "No details available";
    return new PaymentError({
      type: PaymentErrorType.UNKNOWN,
      message: `Unexpected payment error: ${details}`,
      code: Status.INTERNAL,
      originalError,
    });
  }
}
