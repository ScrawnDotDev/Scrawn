import { describe, it, expect } from "vitest";
import { eventSchema } from "../../../zod/event";

describe("eventSchema", () => {
  it("validates a valid SDK_CALL event with RAW type", () => {
    const validEvent = {
      type: 1,
      userId: "550e8400-e29b-41d4-a716-446655440000",
      data: {
        case: "sdkCall",
        value: {
          sdkCallType: 1,
          debitAmount: 10.5,
        },
      },
    };

    const result = eventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("SDK_CALL");
      expect(result.data.userId).toBe("550e8400-e29b-41d4-a716-446655440000");
      expect(result.data.data.sdkCallType).toBe("RAW");
      expect(result.data.data.debitAmount).toBe(1050); // 10.5 * 100
    }
  });

  it("validates a valid SDK_CALL event with MIDDLEWARE_CALL type", () => {
    const validEvent = {
      type: 1,
      userId: "550e8400-e29b-41d4-a716-446655440000",
      data: {
        case: "sdkCall",
        value: {
          sdkCallType: 2,
          debitAmount: 25.99,
        },
      },
    };

    const result = eventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("SDK_CALL");
      expect(result.data.data.sdkCallType).toBe("MIDDLEWARE_CALL");
      expect(result.data.data.debitAmount).toBe(2599); // 25.99 * 100
    }
  });

  it("transforms debitAmount to integer cents", () => {
    const validEvent = {
      type: 1,
      userId: "550e8400-e29b-41d4-a716-446655440000",
      data: {
        case: "sdkCall",
        value: {
          sdkCallType: 1,
          debitAmount: 123.456,
        },
      },
    };

    const result = eventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data.debitAmount).toBe(12345); // floor(123.456 * 100)
    }
  });

  it("handles zero debitAmount", () => {
    const validEvent = {
      type: 1,
      userId: "550e8400-e29b-41d4-a716-446655440000",
      data: {
        case: "sdkCall",
        value: {
          sdkCallType: 1,
          debitAmount: 0,
        },
      },
    };

    const result = eventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data.debitAmount).toBe(0);
    }
  });

  it("rejects invalid userId", () => {
    const invalidEvent = {
      type: 1,
      userId: "not-a-valid-uuid",
      data: {
        case: "sdkCall",
        value: {
          sdkCallType: 1,
          debitAmount: 10.0,
        },
      },
    };

    const result = eventSchema.safeParse(invalidEvent);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Invalid UUID");
    }
  });

  it("rejects missing userId", () => {
    const invalidEvent = {
      type: 1,
      data: {
        case: "sdkCall",
        value: {
          sdkCallType: 1,
          debitAmount: 10.0,
        },
      },
    };

    const result = eventSchema.safeParse(invalidEvent);
    expect(result.success).toBe(false);
  });

  it("rejects invalid event type", () => {
    const invalidEvent = {
      type: 999,
      userId: "550e8400-e29b-41d4-a716-446655440000",
      data: {
        case: "sdkCall",
        value: {
          sdkCallType: 1,
          debitAmount: 10.0,
        },
      },
    };

    const result = eventSchema.safeParse(invalidEvent);
    expect(result.success).toBe(false);
  });

  it("rejects missing type field", () => {
    const invalidEvent = {
      userId: "550e8400-e29b-41d4-a716-446655440000",
      data: {
        case: "sdkCall",
        value: {
          sdkCallType: 1,
          debitAmount: 10.0,
        },
      },
    };

    const result = eventSchema.safeParse(invalidEvent);
    expect(result.success).toBe(false);
  });

  it("rejects invalid sdkCallType", () => {
    const invalidEvent = {
      type: 1,
      userId: "550e8400-e29b-41d4-a716-446655440000",
      data: {
        case: "sdkCall",
        value: {
          sdkCallType: 999,
          debitAmount: 10.0,
        },
      },
    };

    const result = eventSchema.safeParse(invalidEvent);
    expect(result.success).toBe(false);
  });

  it("rejects missing sdkCallType", () => {
    const invalidEvent = {
      type: 1,
      userId: "550e8400-e29b-41d4-a716-446655440000",
      data: {
        case: "sdkCall",
        value: {
          debitAmount: 10.0,
        },
      },
    };

    const result = eventSchema.safeParse(invalidEvent);
    expect(result.success).toBe(false);
  });

  it("rejects missing debitAmount", () => {
    const invalidEvent = {
      type: 1,
      userId: "550e8400-e29b-41d4-a716-446655440000",
      data: {
        case: "sdkCall",
        value: {
          sdkCallType: 1,
        },
      },
    };

    const result = eventSchema.safeParse(invalidEvent);
    expect(result.success).toBe(false);
  });

  it("rejects non-numeric debitAmount", () => {
    const invalidEvent = {
      type: 1,
      userId: "550e8400-e29b-41d4-a716-446655440000",
      data: {
        case: "sdkCall",
        value: {
          sdkCallType: 1,
          debitAmount: "10.5",
        },
      },
    };

    const result = eventSchema.safeParse(invalidEvent);
    expect(result.success).toBe(false);
  });

  it("rejects invalid data case", () => {
    const invalidEvent = {
      type: 1,
      userId: "550e8400-e29b-41d4-a716-446655440000",
      data: {
        case: "invalidCase",
        value: {
          sdkCallType: 1,
          debitAmount: 10.0,
        },
      },
    };

    const result = eventSchema.safeParse(invalidEvent);
    expect(result.success).toBe(false);
  });

  it("rejects missing data field", () => {
    const invalidEvent = {
      type: 1,
      userId: "550e8400-e29b-41d4-a716-446655440000",
    };

    const result = eventSchema.safeParse(invalidEvent);
    expect(result.success).toBe(false);
  });

  it("transforms data structure correctly", () => {
    const validEvent = {
      type: 1,
      userId: "550e8400-e29b-41d4-a716-446655440000",
      data: {
        case: "sdkCall",
        value: {
          sdkCallType: 1,
          debitAmount: 5.5,
        },
      },
    };

    const result = eventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data).not.toHaveProperty("case");
      expect(result.data.data).toHaveProperty("sdkCallType");
      expect(result.data.data).toHaveProperty("debitAmount");
    }
  });

  it("handles negative debitAmount", () => {
    const validEvent = {
      type: 1,
      userId: "550e8400-e29b-41d4-a716-446655440000",
      data: {
        case: "sdkCall",
        value: {
          sdkCallType: 1,
          debitAmount: -5.5,
        },
      },
    };

    const result = eventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data.debitAmount).toBe(-550);
    }
  });

  it("handles large debitAmount values", () => {
    const validEvent = {
      type: 1,
      userId: "550e8400-e29b-41d4-a716-446655440000",
      data: {
        case: "sdkCall",
        value: {
          sdkCallType: 1,
          debitAmount: 999999.99,
        },
      },
    };

    const result = eventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data.debitAmount).toBe(99999999);
    }
  });
});
