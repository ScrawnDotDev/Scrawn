import { describe, it, expect } from "vitest";
import { eventSchema } from "../../../zod/event";

describe("eventSchema", () => {
  it("validates and transforms SDK_CALL event with RAW type", () => {
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
      expect(result.data.data.debitAmount).toBe(1050);
    }
  });

  it("validates and transforms SDK_CALL event with MIDDLEWARE_CALL type", () => {
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
      expect(result.data.data.debitAmount).toBe(2599);
    }
  });

  it("transforms debitAmount from dollars to cents correctly", () => {
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
      expect(result.data.data.debitAmount).toBe(12345);
    }
  });

  it("transforms data structure from protobuf format to internal format", () => {
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
});
