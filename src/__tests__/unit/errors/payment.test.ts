import { describe, it, expect } from "vitest";
import { PaymentError, PaymentErrorType } from "../../../errors/payment";
import { Code } from "@connectrpc/connect";
import { isPaymentError } from "../../helpers/error";

describe("PaymentError", () => {
  describe("PaymentError.invalidUserId", () => {
    it("should create error with userId in message", () => {
      const error = PaymentError.invalidUserId("invalid-user");

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("PaymentError");
      expect(error.type).toBe(PaymentErrorType.INVALID_USER_ID);
      expect(error.message).toContain("invalid-user");
      expect(error.code).toBe(Code.InvalidArgument);
    });

    it("should create error without userId", () => {
      const error = PaymentError.invalidUserId();

      expect(error.type).toBe(PaymentErrorType.INVALID_USER_ID);
      expect((error as any).rawMessage).toBe("Invalid user ID format");
      expect(error.code).toBe(Code.InvalidArgument);
    });

    it("should store original error when provided", () => {
      const originalError = new Error("Original error");
      const error = PaymentError.invalidUserId("test-user", originalError);

      expect(error.originalError).toBe(originalError);
    });

    it("should be identifiable as PaymentError", () => {
      const error = PaymentError.invalidUserId("test-user");

      expect(isPaymentError(error)).toBe(true);
    });
  });

  describe("PaymentError.checkoutCreationFailed", () => {
    it("should create error with details", () => {
      const error = PaymentError.checkoutCreationFailed("Network timeout");

      expect(error.type).toBe(PaymentErrorType.CHECKOUT_CREATION_FAILED);
      expect(error.message).toContain("Network timeout");
      expect(error.code).toBe(Code.Internal);
    });

    it("should create error without details", () => {
      const error = PaymentError.checkoutCreationFailed();

      expect((error as any).rawMessage).toBe("Failed to create checkout link");
      expect(error.code).toBe(Code.Internal);
    });

    it("should store original error", () => {
      const originalError = new Error("API failed");
      const error = PaymentError.checkoutCreationFailed(
        "Details",
        originalError,
      );

      expect(error.originalError).toBe(originalError);
    });
  });

  describe("PaymentError.validationFailed", () => {
    it("should create error with validation details", () => {
      const error = PaymentError.validationFailed("userId is required");

      expect(error.type).toBe(PaymentErrorType.VALIDATION_FAILED);
      expect(error.message).toContain("userId is required");
      expect(error.code).toBe(Code.InvalidArgument);
    });

    it("should include 'Payment validation failed' prefix", () => {
      const error = PaymentError.validationFailed("test error");

      expect((error as any).rawMessage).toMatch(/^Payment validation failed:/);
    });

    it("should store original error", () => {
      const originalError = new Error("Validation error");
      const error = PaymentError.validationFailed("Details", originalError);

      expect(error.originalError).toBe(originalError);
    });
  });

  describe("PaymentError.lemonSqueezyApiError", () => {
    it("should create error with API details", () => {
      const error = PaymentError.lemonSqueezyApiError("Rate limit exceeded");

      expect(error.type).toBe(PaymentErrorType.LEMON_SQUEEZY_API_ERROR);
      expect(error.message).toContain("Rate limit exceeded");
      expect(error.code).toBe(Code.Internal);
    });

    it("should create error without details", () => {
      const error = PaymentError.lemonSqueezyApiError();

      expect((error as any).rawMessage).toBe("Lemon Squeezy API error");
      expect(error.code).toBe(Code.Internal);
    });

    it("should store original error", () => {
      const originalError = new Error("HTTP 500");
      const error = PaymentError.lemonSqueezyApiError(
        "Server error",
        originalError,
      );

      expect(error.originalError).toBe(originalError);
    });
  });

  describe("PaymentError.missingApiKey", () => {
    it("should create error for missing API key", () => {
      const error = PaymentError.missingApiKey();

      expect(error.type).toBe(PaymentErrorType.MISSING_API_KEY);
      expect((error as any).rawMessage).toBe(
        "Lemon Squeezy API key is not configured",
      );
      expect(error.code).toBe(Code.FailedPrecondition);
    });

    it("should store original error when provided", () => {
      const originalError = new Error("Config error");
      const error = PaymentError.missingApiKey(originalError);

      expect(error.originalError).toBe(originalError);
    });
  });

  describe("PaymentError.missingStoreId", () => {
    it("should create error for missing store ID", () => {
      const error = PaymentError.missingStoreId();

      expect(error.type).toBe(PaymentErrorType.MISSING_STORE_ID);
      expect((error as any).rawMessage).toBe(
        "Lemon Squeezy store ID is not configured",
      );
      expect(error.code).toBe(Code.FailedPrecondition);
    });

    it("should store original error when provided", () => {
      const originalError = new Error("Config error");
      const error = PaymentError.missingStoreId(originalError);

      expect(error.originalError).toBe(originalError);
    });
  });

  describe("PaymentError.missingVariantId", () => {
    it("should create error for missing variant ID", () => {
      const error = PaymentError.missingVariantId();

      expect(error.type).toBe(PaymentErrorType.MISSING_VARIANT_ID);
      expect((error as any).rawMessage).toBe(
        "Lemon Squeezy variant ID is not configured",
      );
      expect(error.code).toBe(Code.FailedPrecondition);
    });

    it("should store original error when provided", () => {
      const originalError = new Error("Config error");
      const error = PaymentError.missingVariantId(originalError);

      expect(error.originalError).toBe(originalError);
    });
  });

  describe("PaymentError.invalidCheckoutResponse", () => {
    it("should create error with response details", () => {
      const error = PaymentError.invalidCheckoutResponse("Missing URL field");

      expect(error.type).toBe(PaymentErrorType.INVALID_CHECKOUT_RESPONSE);
      expect(error.message).toContain("Missing URL field");
      expect(error.code).toBe(Code.Internal);
    });

    it("should create error without details", () => {
      const error = PaymentError.invalidCheckoutResponse();

      expect((error as any).rawMessage).toBe(
        "Invalid checkout response from payment provider",
      );
      expect(error.code).toBe(Code.Internal);
    });

    it("should store original error", () => {
      const originalError = new Error("Parse error");
      const error = PaymentError.invalidCheckoutResponse(
        "Bad JSON",
        originalError,
      );

      expect(error.originalError).toBe(originalError);
    });
  });

  describe("PaymentError.priceCalculationFailed", () => {
    it("should create error with userId", () => {
      const error = PaymentError.priceCalculationFailed("user-123");

      expect(error.type).toBe(PaymentErrorType.PRICE_CALCULATION_FAILED);
      expect(error.message).toContain("user-123");
      expect(error.code).toBe(Code.Internal);
    });

    it("should create error without userId", () => {
      const error = PaymentError.priceCalculationFailed();

      expect((error as any).rawMessage).toBe(
        "Failed to calculate checkout price",
      );
      expect(error.code).toBe(Code.Internal);
    });

    it("should store original error", () => {
      const originalError = new Error("Database error");
      const error = PaymentError.priceCalculationFailed(
        "user-123",
        originalError,
      );

      expect(error.originalError).toBe(originalError);
    });
  });

  describe("PaymentError.storageAdapterFailed", () => {
    it("should create error with details", () => {
      const error = PaymentError.storageAdapterFailed("Connection timeout");

      expect(error.type).toBe(PaymentErrorType.STORAGE_ADAPTER_FAILED);
      expect(error.message).toContain("Connection timeout");
      expect(error.code).toBe(Code.Internal);
    });

    it("should create error without details", () => {
      const error = PaymentError.storageAdapterFailed();

      expect((error as any).rawMessage).toBe(
        "Failed to retrieve data from storage",
      );
      expect(error.code).toBe(Code.Internal);
    });

    it("should store original error", () => {
      const originalError = new Error("DB error");
      const error = PaymentError.storageAdapterFailed("Details", originalError);

      expect(error.originalError).toBe(originalError);
    });
  });

  describe("PaymentError.configurationError", () => {
    it("should create error with configuration details", () => {
      const error = PaymentError.configurationError("Invalid webhook URL");

      expect(error.type).toBe(PaymentErrorType.CONFIGURATION_ERROR);
      expect(error.message).toContain("Invalid webhook URL");
      expect(error.code).toBe(Code.FailedPrecondition);
    });

    it("should create error without details", () => {
      const error = PaymentError.configurationError();

      expect((error as any).rawMessage).toBe(
        "Payment system is not configured correctly",
      );
      expect(error.code).toBe(Code.FailedPrecondition);
    });

    it("should store original error", () => {
      const originalError = new Error("Config parse error");
      const error = PaymentError.configurationError("Details", originalError);

      expect(error.originalError).toBe(originalError);
    });
  });

  describe("PaymentError.unknown", () => {
    it("should create unknown error", () => {
      const error = PaymentError.unknown();

      expect(error.type).toBe(PaymentErrorType.UNKNOWN);
      expect((error as any).rawMessage).toBe(
        "An unknown payment processing error occurred",
      );
      expect(error.code).toBe(Code.Internal);
    });

    it("should store original error when provided", () => {
      const originalError = new Error("Unexpected error");
      const error = PaymentError.unknown(originalError);

      expect(error.originalError).toBe(originalError);
    });
  });

  describe("Error properties and inheritance", () => {
    it("should have correct prototype chain", () => {
      const error = PaymentError.invalidUserId("test");

      expect(Object.getPrototypeOf(error)).toBe(PaymentError.prototype);
    });

    it("should be throwable", () => {
      expect(() => {
        throw PaymentError.invalidUserId("test");
      }).toThrow(Error);
    });

    it("should be catchable as Error", () => {
      try {
        throw PaymentError.invalidUserId("test");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    it("should have name property set to PaymentError", () => {
      const error = PaymentError.invalidUserId("test");

      expect(error.name).toBe("PaymentError");
    });

    it("should preserve type through throw and catch", () => {
      let caughtError: any;

      try {
        throw PaymentError.lemonSqueezyApiError("Test");
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError.type).toBe(PaymentErrorType.LEMON_SQUEEZY_API_ERROR);
    });
  });

  describe("Error context and details", () => {
    it("should maintain all context fields", () => {
      const originalError = new Error("Test error");
      const error = PaymentError.checkoutCreationFailed(
        "Details",
        originalError,
      );

      expect(error.type).toBeDefined();
      expect(error.message).toBeDefined();
      expect(error.code).toBeDefined();
      expect(error.originalError).toBe(originalError);
    });

    it("should handle undefined original error gracefully", () => {
      const error = PaymentError.invalidUserId("test", undefined);

      expect(error.originalError).toBeUndefined();
      expect(error.type).toBe(PaymentErrorType.INVALID_USER_ID);
    });

    it("should preserve error codes for different error types", () => {
      const invalidArgErrors = [
        PaymentError.invalidUserId(),
        PaymentError.validationFailed("test"),
      ];

      const internalErrors = [
        PaymentError.checkoutCreationFailed(),
        PaymentError.lemonSqueezyApiError(),
        PaymentError.invalidCheckoutResponse(),
        PaymentError.priceCalculationFailed(),
        PaymentError.storageAdapterFailed(),
        PaymentError.unknown(),
      ];

      const failedPreconditionErrors = [
        PaymentError.missingApiKey(),
        PaymentError.missingStoreId(),
        PaymentError.missingVariantId(),
        PaymentError.configurationError(),
      ];

      invalidArgErrors.forEach((error) => {
        expect(error.code).toBe(Code.InvalidArgument);
      });

      internalErrors.forEach((error) => {
        expect(error.code).toBe(Code.Internal);
      });

      failedPreconditionErrors.forEach((error) => {
        expect(error.code).toBe(Code.FailedPrecondition);
      });
    });
  });

  describe("Error message formatting", () => {
    it("should format messages consistently", () => {
      const errors = [
        PaymentError.invalidUserId("user-123"),
        PaymentError.checkoutCreationFailed("details"),
        PaymentError.validationFailed("validation details"),
        PaymentError.lemonSqueezyApiError("api details"),
      ];

      errors.forEach((error) => {
        expect(error.message).toBeTruthy();
        expect(typeof error.message).toBe("string");
        expect(error.message.length).toBeGreaterThan(0);
      });
    });

    it("should handle empty string details", () => {
      const error = PaymentError.checkoutCreationFailed("");

      expect((error as any).rawMessage).toBe(
        "Failed to create checkout link: ",
      );
    });

    it("should handle special characters in details", () => {
      const error = PaymentError.validationFailed("userId: <invalid>");

      expect(error.message).toContain("userId: <invalid>");
    });
  });
});
