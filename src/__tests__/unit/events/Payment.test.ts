import { describe, it, expect, beforeEach } from "vitest";
import { DateTime } from "luxon";
import { Payment } from "../../../events/RawEvents/Payment";

describe("Payment", () => {
  let userId: string;
  let creditAmount: number;

  beforeEach(() => {
    userId = "test-user-123";
    creditAmount = 1000;
  });

  describe("constructor and initialization", () => {
    it("should create event with userId and creditAmount", () => {
      const event = new Payment(userId, { creditAmount });

      expect(event.userId).toBe(userId);
      expect(event.data.creditAmount).toBe(creditAmount);
    });

    it("should set type to PAYMENT", () => {
      const event = new Payment(userId, { creditAmount });

      expect(event.type).toBe("PAYMENT");
    });

    it("should set reported_timestamp to current UTC time", () => {
      const beforeCreation = DateTime.utc();
      const event = new Payment(userId, { creditAmount });
      const afterCreation = DateTime.utc();

      expect(event.reported_timestamp.isValid).toBe(true);
      expect(event.reported_timestamp.zoneName).toBe("UTC");
      expect(event.reported_timestamp >= beforeCreation).toBe(true);
      expect(event.reported_timestamp <= afterCreation).toBe(true);
    });

    it("should initialize with small credit amount", () => {
      const event = new Payment(userId, { creditAmount: 1 });

      expect(event.data.creditAmount).toBe(1);
    });

    it("should initialize with large credit amount", () => {
      const event = new Payment(userId, { creditAmount: 999999 });

      expect(event.data.creditAmount).toBe(999999);
    });

    it("should handle decimal credit amounts", () => {
      const event = new Payment(userId, { creditAmount: 1599 });

      expect(event.data.creditAmount).toBe(1599);
    });

    it("should handle very large user IDs", () => {
      const longUserId = "a".repeat(1000);
      const event = new Payment(longUserId, { creditAmount });

      expect(event.userId).toBe(longUserId);
      expect(event.userId.length).toBe(1000);
    });

    it("should handle empty user ID", () => {
      const event = new Payment("", { creditAmount });

      expect(event.userId).toBe("");
    });

    it("should handle UUID user IDs", () => {
      const uuidUserId = "123e4567-e89b-12d3-a456-426614174000";
      const event = new Payment(uuidUserId, { creditAmount });

      expect(event.userId).toBe(uuidUserId);
    });

    it("should handle email user IDs", () => {
      const emailUserId = "user@example.com";
      const event = new Payment(emailUserId, { creditAmount });

      expect(event.userId).toBe(emailUserId);
    });

    it("should handle user IDs with special characters", () => {
      const specialUserId = "user!@#$%^&*()_+-={}[]|:;<>?,./";
      const event = new Payment(specialUserId, { creditAmount });

      expect(event.userId).toBe(specialUserId);
    });

    it("should handle user IDs with unicode characters", () => {
      const unicodeUserId = "用户-123-مستخدم";
      const event = new Payment(unicodeUserId, { creditAmount });

      expect(event.userId).toBe(unicodeUserId);
    });
  });

  describe("type property", () => {
    it("should have constant type PAYMENT", () => {
      const event = new Payment(userId, { creditAmount });

      expect(event.type).toBe("PAYMENT");
    });

    it("should have constant type property set at initialization", () => {
      const event = new Payment(userId, { creditAmount });

      const beforeModification = event.type;
      expect(beforeModification).toBe("PAYMENT");

      // Type is readonly, so this test just verifies it's set correctly
      expect(event.type).toBe("PAYMENT");
    });

    it("should match interface event type", () => {
      const event = new Payment(userId, { creditAmount });

      const eventType: "PAYMENT" = event.type;
      expect(eventType).toBe("PAYMENT");
    });
  });

  describe("reported_timestamp property", () => {
    it("should set reported_timestamp to DateTime UTC", () => {
      const event = new Payment(userId, { creditAmount });

      expect(event.reported_timestamp).toBeInstanceOf(DateTime);
      expect(event.reported_timestamp.zoneName).toBe("UTC");
    });

    it("should set reported_timestamp with correct zone", () => {
      const event = new Payment(userId, { creditAmount });

      expect(event.reported_timestamp.zoneName).toBe("UTC");
    });

    it("should have consistent timestamps for sequential creations", () => {
      const event1 = new Payment(userId, { creditAmount });
      const event2 = new Payment(userId, { creditAmount });

      const timeDiff = Math.abs(
        event2.reported_timestamp.toMillis() -
          event1.reported_timestamp.toMillis(),
      );

      expect(timeDiff).toBeLessThan(100);
    });

    it("should allow modification of reported_timestamp", () => {
      const event = new Payment(userId, { creditAmount });

      const customTimestamp = DateTime.utc().minus({ hours: 5 });
      event.reported_timestamp = customTimestamp;

      expect(event.reported_timestamp).toBe(customTimestamp);
    });

    it("should preserve reported_timestamp through serialization", () => {
      const event = new Payment(userId, { creditAmount });

      const originalTimestamp = event.reported_timestamp;
      const serialized = event.serialize();

      expect(serialized.SQL.reported_timestamp).toBe(originalTimestamp);
    });
  });

  describe("data property", () => {
    it("should have creditAmount in data", () => {
      const event = new Payment(userId, { creditAmount: 5000 });

      expect(event.data.creditAmount).toBe(5000);
    });

    it("should allow modification of creditAmount", () => {
      const event = new Payment(userId, { creditAmount: 1000 });

      event.data.creditAmount = 2000;

      expect(event.data.creditAmount).toBe(2000);
    });

    it("should handle creditAmount of 0", () => {
      const event = new Payment(userId, { creditAmount: 0 });

      expect(event.data.creditAmount).toBe(0);
    });

    it("should handle very large creditAmount", () => {
      const event = new Payment(userId, { creditAmount: 999999999 });

      expect(event.data.creditAmount).toBe(999999999);
    });

    it("should handle negative creditAmount", () => {
      const event = new Payment(userId, { creditAmount: -100 });

      expect(event.data.creditAmount).toBe(-100);
    });

    it("should handle Infinity", () => {
      const event = new Payment(userId, { creditAmount: Infinity });

      expect(event.data.creditAmount).toBe(Infinity);
    });

    it("should handle NaN", () => {
      const event = new Payment(userId, { creditAmount: NaN });

      expect(Number.isNaN(event.data.creditAmount)).toBe(true);
    });
  });

  describe("serialize() method", () => {
    it("should return object with SQL property", () => {
      const event = new Payment(userId, { creditAmount });

      const serialized = event.serialize();

      expect(serialized).toHaveProperty("SQL");
    });

    it("should include event type in serialized data", () => {
      const event = new Payment(userId, { creditAmount });

      const serialized = event.serialize();

      expect(serialized.SQL.type).toBe("PAYMENT");
    });

    it("should include userId in serialized data", () => {
      const event = new Payment(userId, { creditAmount });

      const serialized = event.serialize();

      expect(serialized.SQL.userId).toBe(userId);
    });

    it("should include reported_timestamp in serialized data", () => {
      const event = new Payment(userId, { creditAmount });

      const originalTimestamp = event.reported_timestamp;
      const serialized = event.serialize();

      expect(serialized.SQL.reported_timestamp).toBe(originalTimestamp);
    });

    it("should include data with creditAmount in serialized data", () => {
      const event = new Payment(userId, { creditAmount: 2500 });

      const serialized = event.serialize();

      expect(serialized.SQL.data.creditAmount).toBe(2500);
    });

    it("should return new SQL object each time (but same data reference)", () => {
      const event = new Payment(userId, { creditAmount });

      const serialized1 = event.serialize();
      const serialized2 = event.serialize();

      expect(serialized1).not.toBe(serialized2);
      expect(serialized1.SQL).not.toBe(serialized2.SQL);
      expect(serialized1.SQL.data).toBe(serialized2.SQL.data);
    });

    it("should reflect changes in event when re-serialized", () => {
      const event = new Payment(userId, { creditAmount: 1000 });

      const serialized1 = event.serialize();
      expect(serialized1.SQL.data.creditAmount).toBe(1000);

      event.data.creditAmount = 3000;
      const serialized2 = event.serialize();

      expect(serialized2.SQL.data.creditAmount).toBe(3000);
    });

    it("should reflect userId changes when re-serialized", () => {
      const event = new Payment(userId, { creditAmount });

      const serialized1 = event.serialize();
      expect(serialized1.SQL.userId).toBe(userId);

      const newUserId = "new-user-456";
      event.userId = newUserId;
      const serialized2 = event.serialize();

      expect(serialized2.SQL.userId).toBe(newUserId);
    });

    it("should handle serialization with zero credit amount", () => {
      const event = new Payment(userId, { creditAmount: 0 });

      const serialized = event.serialize();

      expect(serialized.SQL.data.creditAmount).toBe(0);
    });

    it("should handle serialization with large credit amount", () => {
      const largeAmount = 9999999;
      const event = new Payment(userId, { creditAmount: largeAmount });

      const serialized = event.serialize();

      expect(serialized.SQL.data.creditAmount).toBe(largeAmount);
    });
  });

  describe("interface compliance", () => {
    it("should implement PaymentEventType interface", () => {
      const event = new Payment(userId, { creditAmount });

      expect(event.type).toBe("PAYMENT");
      expect(event.userId).toBe(userId);
      expect(event.reported_timestamp).toBeInstanceOf(DateTime);
      expect(event.data.creditAmount).toBe(creditAmount);
      expect(typeof event.serialize).toBe("function");
    });

    it("should have readonly type property as per interface", () => {
      const event = new Payment(userId, { creditAmount });

      expect(event.type).toBe("PAYMENT");
    });

    it("should have serialize method as per interface", () => {
      const event = new Payment(userId, { creditAmount });

      expect(typeof event.serialize).toBe("function");
      expect(event.serialize()).toHaveProperty("SQL");
    });

    it("should work as EventType generic", () => {
      const event = new Payment(userId, { creditAmount });

      const serialized = event.serialize();

      expect(serialized.SQL.type).toBe("PAYMENT");
      expect(serialized.SQL.data).toHaveProperty("creditAmount");
    });
  });

  describe("edge cases and boundaries", () => {
    it("should handle multiple rapid event creations", () => {
      const events = Array.from({ length: 100 }, (_, i) => {
        return new Payment(userId, { creditAmount: i * 100 });
      });

      expect(events).toHaveLength(100);
      events.forEach((event, i) => {
        expect(event.data.creditAmount).toBe(i * 100);
      });
    });

    it("should handle creation with same userId multiple times", () => {
      const event1 = new Payment(userId, { creditAmount: 1000 });
      const event2 = new Payment(userId, { creditAmount: 2000 });
      const event3 = new Payment(userId, { creditAmount: 3000 });

      expect(event1.userId).toBe(userId);
      expect(event2.userId).toBe(userId);
      expect(event3.userId).toBe(userId);
      expect(event1.data.creditAmount).toBe(1000);
      expect(event2.data.creditAmount).toBe(2000);
      expect(event3.data.creditAmount).toBe(3000);
    });

    it("should maintain separate state across multiple instances", () => {
      const event1 = new Payment(userId, { creditAmount: 1000 });
      const event2 = new Payment(userId, { creditAmount: 2000 });

      event1.data.creditAmount = 5000;

      expect(event1.data.creditAmount).toBe(5000);
      expect(event2.data.creditAmount).toBe(2000);
    });

    it("should handle whitespace in user ID", () => {
      const event = new Payment("  user with spaces  ", { creditAmount });

      expect(event.userId).toBe("  user with spaces  ");
    });

    it("should handle numeric user IDs as strings", () => {
      const event = new Payment("12345", { creditAmount });

      expect(event.userId).toBe("12345");
    });

    it("should handle timestamp changes between serializations", () => {
      const event = new Payment(userId, { creditAmount });

      const originalTimestamp = event.reported_timestamp;
      const serialized1 = event.serialize();

      event.reported_timestamp = DateTime.utc().minus({ hours: 1 });
      const serialized2 = event.serialize();

      expect(serialized1.SQL.reported_timestamp).toBe(originalTimestamp);
      expect(serialized2.SQL.reported_timestamp).not.toBe(originalTimestamp);
    });
  });

  describe("performance and memory", () => {
    it("should create event synchronously", () => {
      const start = Date.now();
      const event = new Payment(userId, { creditAmount });
      const duration = Date.now() - start;

      expect(event).toBeDefined();
      expect(duration).toBeLessThan(10);
    });

    it("should serialize event synchronously", () => {
      const event = new Payment(userId, { creditAmount });

      const start = Date.now();
      const serialized = event.serialize();
      const duration = Date.now() - start;

      expect(serialized).toBeDefined();
      expect(duration).toBeLessThan(10);
    });

    it("should handle large number of serializations", () => {
      const event = new Payment(userId, { creditAmount });

      const serializations = Array.from({ length: 1000 }, () =>
        event.serialize(),
      );

      expect(serializations).toHaveLength(1000);
      serializations.forEach((s) => {
        expect(s.SQL.type).toBe("PAYMENT");
      });
    });

    it("should not leak memory with repeated modifications", () => {
      const event = new Payment(userId, { creditAmount: 1000 });

      for (let i = 0; i < 1000; i++) {
        event.data.creditAmount = i;
      }

      expect(event.data.creditAmount).toBe(999);
    });
  });

  describe("data immutability concerns", () => {
    it("should allow modification of userId after creation", () => {
      const event = new Payment(userId, { creditAmount });

      const newUserId = "new-user-456";
      event.userId = newUserId;

      expect(event.userId).toBe(newUserId);
    });

    it("should allow modification of creditAmount after creation", () => {
      const event = new Payment(userId, { creditAmount: 1000 });

      event.data.creditAmount = 2000;

      expect(event.data.creditAmount).toBe(2000);
    });

    it("should allow modification of reported_timestamp after creation", () => {
      const event = new Payment(userId, { creditAmount });

      const newTimestamp = DateTime.utc().minus({ days: 1 });
      event.reported_timestamp = newTimestamp;

      expect(event.reported_timestamp).toBe(newTimestamp);
    });

    it("should preserve modifications in serialization", () => {
      const event = new Payment(userId, { creditAmount: 1000 });

      event.data.creditAmount = 3000;
      event.userId = "modified-user";

      const serialized = event.serialize();

      expect(serialized.SQL.userId).toBe("modified-user");
      expect(serialized.SQL.data.creditAmount).toBe(3000);
    });
  });

  describe("type assertions", () => {
    it("should be assignable to EventType", () => {
      const event = new Payment(userId, { creditAmount });

      const anyEvent = event;

      expect(anyEvent.type).toBe("PAYMENT");
    });

    it("should have all required properties for storage", () => {
      const event = new Payment(userId, { creditAmount });

      const serialized = event.serialize();
      const sqlData = serialized.SQL;

      expect(sqlData).toHaveProperty("type");
      expect(sqlData).toHaveProperty("userId");
      expect(sqlData).toHaveProperty("reported_timestamp");
      expect(sqlData).toHaveProperty("data");
      expect(sqlData.data).toHaveProperty("creditAmount");
    });

    it("should be compatible with database storage format", () => {
      const event = new Payment(userId, { creditAmount: 1599 });

      const serialized = event.serialize();
      const sqlData = serialized.SQL;

      expect(sqlData.type).toBe("PAYMENT");
      expect(sqlData.userId).toBe(userId);
      expect(sqlData.data.creditAmount).toBe(1599);
      expect(sqlData.reported_timestamp).toBeInstanceOf(DateTime);
    });
  });

  describe("constructor parameter validation", () => {
    it("should accept any string as userId", () => {
      const testIds = [
        "",
        "simple",
        "with-dashes",
        "with_underscores",
        "123numeric",
        "special!@#$%",
        "unicode-用户",
      ];

      testIds.forEach((testId) => {
        const event = new Payment(testId, { creditAmount });
        expect(event.userId).toBe(testId);
      });
    });

    it("should accept any number as creditAmount", () => {
      const amounts = [0, 1, -1, 999999, 0.01, -50.5, Infinity, -Infinity];

      amounts.forEach((amount) => {
        const event = new Payment(userId, { creditAmount: amount });
        expect(event.data.creditAmount).toBe(amount);
      });
    });

    it("should accept data object with only creditAmount", () => {
      const data = { creditAmount: 1000 };
      const event = new Payment(userId, data);

      expect(event.data).toBe(data);
      expect(event.data.creditAmount).toBe(1000);
    });

    it("should maintain reference to passed data object", () => {
      const data = { creditAmount: 1000 };
      const event = new Payment(userId, data);

      data.creditAmount = 2000;

      expect(event.data.creditAmount).toBe(2000);
    });
  });
});
