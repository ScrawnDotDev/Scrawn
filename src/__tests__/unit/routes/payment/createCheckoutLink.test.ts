import { describe, it, expect, beforeEach, vi } from "vitest";
import type { HandlerContext } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import { CreateCheckoutLinkRequestSchema } from "../../../../gen/payment/v1/payment_pb";
import { isPaymentError } from "../../../helpers/error";

// Set environment variables BEFORE importing the module
process.env.LEMON_SQUEEZY_API_KEY = "test-api-key";
process.env.LEMON_SQUEEZY_STORE_ID = "test-store-id";
process.env.LEMON_SQUEEZY_VARIANT_ID = "test-variant-id";

// Mock dependencies BEFORE importing the module
vi.mock("@lemonsqueezy/lemonsqueezy.js", () => ({
  lemonSqueezySetup: vi.fn(),
  createCheckout: vi.fn(),
}));

vi.mock("../../../../factory", () => ({
  StorageAdapterFactory: {
    getStorageAdapter: vi.fn(),
  },
}));

import {
  lemonSqueezySetup,
  createCheckout,
} from "@lemonsqueezy/lemonsqueezy.js";
import { StorageAdapterFactory } from "../../../../factory";
import { createCheckoutLink } from "../../../../routes/payment/createCheckoutLink";

describe("createCheckoutLink", () => {
  let mockContext: HandlerContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = {} as HandlerContext;
  });

  describe("Request validation", () => {
    it("should throw PaymentError for invalid UUID", async () => {
      const request = create(CreateCheckoutLinkRequestSchema, {
        userId: "not-a-uuid",
      });

      try {
        await createCheckoutLink(request, mockContext);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(isPaymentError(error)).toBe(true);
        expect((error as any).type).toBe("VALIDATION_FAILED");
        expect((error as any).message).toContain("Invalid UUID");
      }
    });

    it("should throw PaymentError for empty userId", async () => {
      const request = create(CreateCheckoutLinkRequestSchema, {
        userId: "",
      });

      try {
        await createCheckoutLink(request, mockContext);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(isPaymentError(error)).toBe(true);
        expect((error as any).type).toBe("VALIDATION_FAILED");
      }
    });
  });

  describe("Price calculation", () => {
    it("should call storage adapter to get price", async () => {
      const mockStorageAdapter = {
        price: vi.fn().mockResolvedValue(2500),
      };

      (StorageAdapterFactory.getStorageAdapter as any).mockResolvedValue(
        mockStorageAdapter,
      );

      (createCheckout as any).mockResolvedValue({
        data: {
          data: {
            attributes: {
              url: "https://checkout.lemonsqueezy.com/test",
            },
          },
        },
      });

      const request = create(CreateCheckoutLinkRequestSchema, {
        userId: "12345678-1234-4234-a234-123456789012",
      });

      await createCheckoutLink(request, mockContext);

      expect(mockStorageAdapter.price).toHaveBeenCalled();
    });

    it("should throw PaymentError when adapter is null", async () => {
      (StorageAdapterFactory.getStorageAdapter as any).mockResolvedValue(null);

      const request = create(CreateCheckoutLinkRequestSchema, {
        userId: "12345678-1234-4234-a234-123456789012",
      });

      try {
        await createCheckoutLink(request, mockContext);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(isPaymentError(error)).toBe(true);
        expect((error as any).type).toBe("STORAGE_ADAPTER_FAILED");
      }
    });

    it("should throw PaymentError for invalid price (NaN)", async () => {
      const mockStorageAdapter = {
        price: vi.fn().mockResolvedValue(NaN),
      };

      (StorageAdapterFactory.getStorageAdapter as any).mockResolvedValue(
        mockStorageAdapter,
      );

      const request = create(CreateCheckoutLinkRequestSchema, {
        userId: "12345678-1234-4234-a234-123456789012",
      });

      try {
        await createCheckoutLink(request, mockContext);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(isPaymentError(error)).toBe(true);
        expect((error as any).type).toBe("PRICE_CALCULATION_FAILED");
      }
    });

    it("should throw PaymentError for negative price", async () => {
      const mockStorageAdapter = {
        price: vi.fn().mockResolvedValue(-100),
      };

      (StorageAdapterFactory.getStorageAdapter as any).mockResolvedValue(
        mockStorageAdapter,
      );

      const request = create(CreateCheckoutLinkRequestSchema, {
        userId: "12345678-1234-4234-a234-123456789012",
      });

      try {
        await createCheckoutLink(request, mockContext);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(isPaymentError(error)).toBe(true);
        expect((error as any).type).toBe("PRICE_CALCULATION_FAILED");
      }
    });

    it("should throw PaymentError for zero price", async () => {
      const mockStorageAdapter = {
        price: vi.fn().mockResolvedValue(0),
      };

      (StorageAdapterFactory.getStorageAdapter as any).mockResolvedValue(
        mockStorageAdapter,
      );

      const request = create(CreateCheckoutLinkRequestSchema, {
        userId: "12345678-1234-4234-a234-123456789012",
      });

      try {
        await createCheckoutLink(request, mockContext);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(isPaymentError(error)).toBe(true);
        expect((error as any).type).toBe("PRICE_CALCULATION_FAILED");
      }
    });

    it("should handle storage adapter errors", async () => {
      const mockStorageAdapter = {
        price: vi.fn().mockRejectedValue(new Error("Database error")),
      };

      (StorageAdapterFactory.getStorageAdapter as any).mockResolvedValue(
        mockStorageAdapter,
      );

      const request = create(CreateCheckoutLinkRequestSchema, {
        userId: "12345678-1234-4234-a234-123456789012",
      });

      try {
        await createCheckoutLink(request, mockContext);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(isPaymentError(error)).toBe(true);
        expect((error as any).type).toBe("PRICE_CALCULATION_FAILED");
      }
    });
  });

  describe("Lemon Squeezy SDK", () => {
    it("should call lemonSqueezySetup with API key", async () => {
      const mockStorageAdapter = {
        price: vi.fn().mockResolvedValue(1000),
      };

      (StorageAdapterFactory.getStorageAdapter as any).mockResolvedValue(
        mockStorageAdapter,
      );

      (createCheckout as any).mockResolvedValue({
        data: {
          data: {
            attributes: {
              url: "https://checkout.lemonsqueezy.com/test",
            },
          },
        },
      });

      const request = create(CreateCheckoutLinkRequestSchema, {
        userId: "12345678-1234-4234-a234-123456789012",
      });

      await createCheckoutLink(request, mockContext);

      expect(lemonSqueezySetup).toHaveBeenCalledWith({
        apiKey: "test-api-key",
        onError: expect.any(Function),
      });
    });

    it("should create checkout with correct parameters", async () => {
      const mockStorageAdapter = {
        price: vi.fn().mockResolvedValue(1500),
      };

      (StorageAdapterFactory.getStorageAdapter as any).mockResolvedValue(
        mockStorageAdapter,
      );

      (createCheckout as any).mockResolvedValue({
        data: {
          data: {
            attributes: {
              url: "https://checkout.lemonsqueezy.com/test",
            },
          },
        },
      });

      const request = create(CreateCheckoutLinkRequestSchema, {
        userId: "12345678-1234-4234-a234-123456789012",
      });

      await createCheckoutLink(request, mockContext);

      expect(createCheckout).toHaveBeenCalledWith(
        "test-store-id",
        "test-variant-id",
        {
          customPrice: 1500,
          checkoutData: {
            custom: {
              user_id: "12345678-1234-4234-a234-123456789012",
            },
          },
        },
      );
    });

    it("should throw PaymentError when API call fails", async () => {
      const mockStorageAdapter = {
        price: vi.fn().mockResolvedValue(1000),
      };

      (StorageAdapterFactory.getStorageAdapter as any).mockResolvedValue(
        mockStorageAdapter,
      );

      (createCheckout as any).mockRejectedValue(new Error("API timeout"));

      const request = create(CreateCheckoutLinkRequestSchema, {
        userId: "12345678-1234-4234-a234-123456789012",
      });

      try {
        await createCheckoutLink(request, mockContext);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(isPaymentError(error)).toBe(true);
        expect((error as any).type).toBe("LEMON_SQUEEZY_API_ERROR");
        expect((error as any).message).toContain("API timeout");
      }
    });
  });

  describe("Response validation", () => {
    it("should throw PaymentError for null response", async () => {
      const mockStorageAdapter = {
        price: vi.fn().mockResolvedValue(1000),
      };

      (StorageAdapterFactory.getStorageAdapter as any).mockResolvedValue(
        mockStorageAdapter,
      );

      (createCheckout as any).mockResolvedValue(null);

      const request = create(CreateCheckoutLinkRequestSchema, {
        userId: "12345678-1234-4234-a234-123456789012",
      });

      try {
        await createCheckoutLink(request, mockContext);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(isPaymentError(error)).toBe(true);
        expect((error as any).type).toBe("INVALID_CHECKOUT_RESPONSE");
      }
    });

    it("should throw PaymentError when response contains error", async () => {
      const mockStorageAdapter = {
        price: vi.fn().mockResolvedValue(1000),
      };

      (StorageAdapterFactory.getStorageAdapter as any).mockResolvedValue(
        mockStorageAdapter,
      );

      (createCheckout as any).mockResolvedValue({
        error: {
          message: "Invalid variant ID",
        },
      });

      const request = create(CreateCheckoutLinkRequestSchema, {
        userId: "12345678-1234-4234-a234-123456789012",
      });

      try {
        await createCheckoutLink(request, mockContext);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(isPaymentError(error)).toBe(true);
        expect((error as any).type).toBe("CHECKOUT_CREATION_FAILED");
        expect((error as any).message).toContain("Invalid variant ID");
      }
    });

    it("should throw PaymentError for missing URL", async () => {
      const mockStorageAdapter = {
        price: vi.fn().mockResolvedValue(1000),
      };

      (StorageAdapterFactory.getStorageAdapter as any).mockResolvedValue(
        mockStorageAdapter,
      );

      (createCheckout as any).mockResolvedValue({
        data: {
          data: {
            attributes: {},
          },
        },
      });

      const request = create(CreateCheckoutLinkRequestSchema, {
        userId: "12345678-1234-4234-a234-123456789012",
      });

      try {
        await createCheckoutLink(request, mockContext);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(isPaymentError(error)).toBe(true);
        expect((error as any).type).toBe("INVALID_CHECKOUT_RESPONSE");
      }
    });

    it("should throw PaymentError for invalid URL format", async () => {
      const mockStorageAdapter = {
        price: vi.fn().mockResolvedValue(1000),
      };

      (StorageAdapterFactory.getStorageAdapter as any).mockResolvedValue(
        mockStorageAdapter,
      );

      (createCheckout as any).mockResolvedValue({
        data: {
          data: {
            attributes: {
              url: "not-a-valid-url",
            },
          },
        },
      });

      const request = create(CreateCheckoutLinkRequestSchema, {
        userId: "12345678-1234-4234-a234-123456789012",
      });

      try {
        await createCheckoutLink(request, mockContext);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(isPaymentError(error)).toBe(true);
        expect((error as any).type).toBe("INVALID_CHECKOUT_RESPONSE");
      }
    });
  });

  describe("Successful checkout creation", () => {
    it("should return checkout link on success", async () => {
      const mockStorageAdapter = {
        price: vi.fn().mockResolvedValue(1000),
      };

      (StorageAdapterFactory.getStorageAdapter as any).mockResolvedValue(
        mockStorageAdapter,
      );

      (createCheckout as any).mockResolvedValue({
        data: {
          data: {
            attributes: {
              url: "https://checkout.lemonsqueezy.com/checkout-123",
            },
          },
        },
      });

      const request = create(CreateCheckoutLinkRequestSchema, {
        userId: "12345678-1234-4234-a234-123456789012",
      });

      const response = await createCheckoutLink(request, mockContext);

      expect(response).toBeDefined();
      expect(response.checkoutLink).toBe(
        "https://checkout.lemonsqueezy.com/checkout-123",
      );
    });

    it("should pass custom price to checkout", async () => {
      const mockStorageAdapter = {
        price: vi.fn().mockResolvedValue(1234.56),
      };

      (StorageAdapterFactory.getStorageAdapter as any).mockResolvedValue(
        mockStorageAdapter,
      );

      (createCheckout as any).mockResolvedValue({
        data: {
          data: {
            attributes: {
              url: "https://checkout.lemonsqueezy.com/test",
            },
          },
        },
      });

      const request = create(CreateCheckoutLinkRequestSchema, {
        userId: "12345678-1234-4234-a234-123456789012",
      });

      await createCheckoutLink(request, mockContext);

      expect(createCheckout).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          customPrice: 1234.56,
        }),
      );
    });

    it("should include userId in checkout custom data", async () => {
      const userId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
      const mockStorageAdapter = {
        price: vi.fn().mockResolvedValue(1000),
      };

      (StorageAdapterFactory.getStorageAdapter as any).mockResolvedValue(
        mockStorageAdapter,
      );

      (createCheckout as any).mockResolvedValue({
        data: {
          data: {
            attributes: {
              url: "https://checkout.lemonsqueezy.com/test",
            },
          },
        },
      });

      const request = create(CreateCheckoutLinkRequestSchema, {
        userId,
      });

      await createCheckoutLink(request, mockContext);

      expect(createCheckout).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          checkoutData: {
            custom: {
              user_id: userId,
            },
          },
        }),
      );
    });
  });
});
