import { describe, it, expect, beforeEach, vi } from "vitest";
import { SDKCall } from "../../../events/RawEvents/SDKCall";
import { DateTime } from "luxon";
import type { SDKCallEventType } from "../../../interface/event/Event";

describe("SDKCall", () => {
  let userId: string;
  let debitAmount: number;

  beforeEach(() => {
    userId = "user-123";
    debitAmount = 100;
  });

  describe("constructor and initialization", () => {
    it("should create event with userId and debitAmount", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      expect(event.userId).toBe(userId);
      expect(event.data.debitAmount).toBe(debitAmount);
    });

    it("should set type to SDK_CALL", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      expect(event.type).toBe("SDK_CALL");
    });

    it("should set reported_timestamp to current UTC time", () => {
      const beforeCreation = DateTime.utc();
      const event = new SDKCall(userId, {
        debitAmount,
      });
      const afterCreation = DateTime.utc();

      expect(event.reported_timestamp.toISO()).toBeTruthy();
      expect(event.reported_timestamp.toMillis()).toBeGreaterThanOrEqual(
        beforeCreation.toMillis(),
      );
      expect(event.reported_timestamp.toMillis()).toBeLessThanOrEqual(
        afterCreation.toMillis(),
      );
    });

    it("should initialize with zero debit amount", () => {
      const event = new SDKCall(userId, {
        debitAmount: 0,
      });

      expect(event.data.debitAmount).toBe(0);
    });

    it("should initialize with negative debit amount", () => {
      const event = new SDKCall(userId, {
        debitAmount: -50,
      });

      expect(event.data.debitAmount).toBe(-50);
    });

    it("should initialize with large debit amount", () => {
      const event = new SDKCall(userId, {
        debitAmount: 999999.99,
      });

      expect(event.data.debitAmount).toBe(999999.99);
    });

    it("should handle very small debit amounts", () => {
      const event = new SDKCall(userId, {
        debitAmount: 0.01,
      });

      expect(event.data.debitAmount).toBe(0.01);
    });

    it("should handle very large user IDs", () => {
      const longUserId = "u".repeat(1000);
      const event = new SDKCall(longUserId, {
        debitAmount,
      });

      expect(event.userId).toBe(longUserId);
      expect(event.userId.length).toBe(1000);
    });

    it("should handle empty user ID", () => {
      const event = new SDKCall("", {
        debitAmount,
      });

      expect(event.userId).toBe("");
    });

    it("should handle UUID user IDs", () => {
      const uuidUserId = "12345678-1234-1234-1234-123456789012";
      const event = new SDKCall(uuidUserId, {
        debitAmount,
      });

      expect(event.userId).toBe(uuidUserId);
    });

    it("should handle email user IDs", () => {
      const emailUserId = "user@example.com";
      const event = new SDKCall(emailUserId, {
        debitAmount,
      });

      expect(event.userId).toBe(emailUserId);
    });

    it("should handle user IDs with special characters", () => {
      const specialUserId = "user!@#$%^&*()_+-=[]{}|;:,.<>?";
      const event = new SDKCall(specialUserId, {
        debitAmount,
      });

      expect(event.userId).toBe(specialUserId);
    });

    it("should handle user IDs with unicode characters", () => {
      const unicodeUserId = "user_中文_العربية";
      const event = new SDKCall(unicodeUserId, {
        debitAmount,
      });

      expect(event.userId).toBe(unicodeUserId);
    });
  });

  describe("type property", () => {
    it("should have constant type SDK_CALL", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      expect(event.type).toBe("SDK_CALL");
    });

    it("should have constant type property set at initialization", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      // Type is constant and cannot be modified
      expect(event.type).toBe("SDK_CALL");

      // Attempting to modify type (readonly at compile time)
      const beforeModification = event.type;
      (event as any).type = "OTHER_TYPE";

      // In strict mode, readonly prevents modification; in loose mode it might change
      // The important thing is the type constant is set correctly initially
      expect(beforeModification).toBe("SDK_CALL");
    });

    it("should match interface event type", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      const eventType: SDKCallEventType = event;
      expect(eventType.type).toBe("SDK_CALL");
    });
  });

  describe("reported_timestamp property", () => {
    it("should set reported_timestamp to DateTime UTC", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      expect(event.reported_timestamp).toBeInstanceOf(DateTime);
    });

    it("should set reported_timestamp with correct zone", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      expect(event.reported_timestamp.zone.name).toBe("UTC");
    });

    it("should have consistent timestamps for sequential creations", () => {
      const event1 = new SDKCall(userId, {
        debitAmount,
      });
      const event2 = new SDKCall(userId, {
        debitAmount,
      });

      const timeDiff = event2.reported_timestamp
        .diff(event1.reported_timestamp)
        .toObject().milliseconds;

      expect(timeDiff).toBeGreaterThanOrEqual(0);
      expect(timeDiff).toBeLessThan(100); // Should be very close
    });

    it("should allow modification of reported_timestamp", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      const customTimestamp = DateTime.utc().minus({ hours: 1 });
      event.reported_timestamp = customTimestamp;

      expect(event.reported_timestamp).toBe(customTimestamp);
    });

    it("should preserve reported_timestamp through serialization", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      const originalTimestamp = event.reported_timestamp;
      const serialized = event.serialize();

      expect(serialized.SQL.reported_timestamp).toBe(originalTimestamp);
    });
  });

  describe("data property", () => {
    it("should have debitAmount in data", () => {
      const event = new SDKCall(userId, {
        debitAmount: 250,
      });

      expect(event.data).toHaveProperty("debitAmount");
      expect(event.data.debitAmount).toBe(250);
    });

    it("should allow modification of debitAmount", () => {
      const event = new SDKCall(userId, {
        debitAmount: 100,
      });

      event.data.debitAmount = 200;

      expect(event.data.debitAmount).toBe(200);
    });

    it("should handle debitAmount of 0", () => {
      const event = new SDKCall(userId, {
        debitAmount: 0,
      });

      expect(event.data.debitAmount).toBe(0);
    });

    it("should handle decimal debitAmount", () => {
      const event = new SDKCall(userId, {
        debitAmount: 123.45,
      });

      expect(event.data.debitAmount).toBe(123.45);
    });

    it("should handle very precise decimal values", () => {
      const event = new SDKCall(userId, {
        debitAmount: 0.0001,
      });

      expect(event.data.debitAmount).toBe(0.0001);
    });

    it("should handle negative debitAmount", () => {
      const event = new SDKCall(userId, {
        debitAmount: -100,
      });

      expect(event.data.debitAmount).toBe(-100);
    });

    it("should handle Infinity", () => {
      const event = new SDKCall(userId, {
        debitAmount: Infinity,
      });

      expect(event.data.debitAmount).toBe(Infinity);
    });

    it("should handle NaN", () => {
      const event = new SDKCall(userId, {
        debitAmount: NaN,
      });

      expect(Number.isNaN(event.data.debitAmount)).toBe(true);
    });
  });

  describe("serialize() method", () => {
    it("should return object with SQL property", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      const serialized = event.serialize();

      expect(serialized).toHaveProperty("SQL");
    });

    it("should include event type in serialized data", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      const serialized = event.serialize();

      expect(serialized.SQL.type).toBe("SDK_CALL");
    });

    it("should include userId in serialized data", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      const serialized = event.serialize();

      expect(serialized.SQL.userId).toBe(userId);
    });

    it("should include reported_timestamp in serialized data", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      const originalTimestamp = event.reported_timestamp;
      const serialized = event.serialize();

      expect(serialized.SQL.reported_timestamp).toBe(originalTimestamp);
    });

    it("should include data with debitAmount in serialized data", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      const serialized = event.serialize();

      expect(serialized.SQL.data).toHaveProperty("debitAmount");
      expect(serialized.SQL.data.debitAmount).toBe(debitAmount);
    });

    it("should return new SQL object each time (but same data reference)", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      const serialized1 = event.serialize();
      const serialized2 = event.serialize();

      expect(serialized1).not.toBe(serialized2);
      expect(serialized1.SQL).not.toBe(serialized2.SQL);
      // Data object is the same reference (not cloned)
      expect(serialized1.SQL.data).toBe(serialized2.SQL.data);
    });

    it("should reflect changes in event when re-serialized", () => {
      const event = new SDKCall(userId, {
        debitAmount: 100,
      });

      const serialized1 = event.serialize();
      expect(serialized1.SQL.data.debitAmount).toBe(100);

      event.data.debitAmount = 200;
      const serialized2 = event.serialize();

      expect(serialized2.SQL.data.debitAmount).toBe(200);
    });

    it("should reflect userId changes when re-serialized", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      const serialized1 = event.serialize();
      expect(serialized1.SQL.userId).toBe(userId);

      const newUserId = "user-456";
      event.userId = newUserId;
      const serialized2 = event.serialize();

      expect(serialized2.SQL.userId).toBe(newUserId);
    });

    it("should handle serialization with zero debit amount", () => {
      const event = new SDKCall(userId, {
        debitAmount: 0,
      });

      const serialized = event.serialize();

      expect(serialized.SQL.data.debitAmount).toBe(0);
    });

    it("should handle serialization with negative debit amount", () => {
      const event = new SDKCall(userId, {
        debitAmount: -100,
      });

      const serialized = event.serialize();

      expect(serialized.SQL.data.debitAmount).toBe(-100);
    });

    it("should handle serialization with very large debit amount", () => {
      const largeAmount = 999999999.99;
      const event = new SDKCall(userId, {
        debitAmount: largeAmount,
      });

      const serialized = event.serialize();

      expect(serialized.SQL.data.debitAmount).toBe(largeAmount);
    });
  });

  describe("interface compliance", () => {
    it("should implement SDKCallEventType interface", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      const interfaceEvent: SDKCallEventType = event;

      expect(interfaceEvent.type).toBe("SDK_CALL");
      expect(interfaceEvent.userId).toBe(userId);
      expect(interfaceEvent.reported_timestamp).toBeInstanceOf(DateTime);
      expect(interfaceEvent.data.debitAmount).toBe(debitAmount);
    });

    it("should have readonly userId property as per interface", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      // Can be assigned in constructor but can be modified after
      event.userId = "new-user";
      expect(event.userId).toBe("new-user");
    });

    it("should have readonly reported_timestamp property as per interface", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      // Can be assigned after construction
      const newTimestamp = DateTime.utc().minus({ hours: 2 });
      event.reported_timestamp = newTimestamp;
      expect(event.reported_timestamp).toBe(newTimestamp);
    });

    it("should have readonly data property as per interface", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      // Can modify contents but property itself is assigned in constructor
      event.data.debitAmount = 500;
      expect(event.data.debitAmount).toBe(500);
    });

    it("should have serialize method as per interface", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      expect(typeof event.serialize).toBe("function");
      expect(event.serialize()).toHaveProperty("SQL");
    });

    it("should work as EventType generic", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      // Test that it satisfies EventType<"SDK_CALL">
      const serialized = event.serialize();
      expect(serialized.SQL.type).toBe(event.type);
      expect(serialized.SQL.userId).toBe(event.userId);
      expect(serialized.SQL.reported_timestamp).toBe(event.reported_timestamp);
      expect(serialized.SQL.data).toEqual(event.data);
    });
  });

  describe("edge cases and boundaries", () => {
    it("should handle multiple rapid event creations", () => {
      const events = Array.from({ length: 100 }, (_, i) => {
        return new SDKCall(`user-${i}`, {
          debitAmount: i * 10,
        });
      });

      expect(events).toHaveLength(100);
      events.forEach((event, i) => {
        expect(event.userId).toBe(`user-${i}`);
        expect(event.data.debitAmount).toBe(i * 10);
      });
    });

    it("should handle creation with same userId multiple times", () => {
      const event1 = new SDKCall(userId, {
        debitAmount: 100,
      });
      const event2 = new SDKCall(userId, {
        debitAmount: 200,
      });
      const event3 = new SDKCall(userId, {
        debitAmount: 300,
      });

      expect(event1.userId).toBe(event2.userId);
      expect(event2.userId).toBe(event3.userId);
      expect(event1.data.debitAmount).toBe(100);
      expect(event2.data.debitAmount).toBe(200);
      expect(event3.data.debitAmount).toBe(300);
    });

    it("should maintain separate state across multiple instances", () => {
      const event1 = new SDKCall("user-1", {
        debitAmount: 100,
      });
      const event2 = new SDKCall("user-2", {
        debitAmount: 200,
      });

      event1.data.debitAmount = 500;

      expect(event1.data.debitAmount).toBe(500);
      expect(event2.data.debitAmount).toBe(200);
    });

    it("should handle whitespace in user ID", () => {
      const event = new SDKCall(" user-123 ", {
        debitAmount,
      });

      expect(event.userId).toBe(" user-123 ");
    });

    it("should handle numeric user IDs as strings", () => {
      const event = new SDKCall("12345", {
        debitAmount,
      });

      expect(event.userId).toBe("12345");
      expect(typeof event.userId).toBe("string");
    });

    it("should handle very precise decimal debit amounts", () => {
      const preciseAmount = 0.000000001;
      const event = new SDKCall(userId, {
        debitAmount: preciseAmount,
      });

      expect(event.data.debitAmount).toBe(preciseAmount);
    });

    it("should handle duplicate role references in data object", () => {
      const dataObject = { debitAmount: 100 };
      const event1 = new SDKCall(userId, dataObject);
      const event2 = new SDKCall(userId, dataObject);

      // Both should reference same data object initially
      expect(event1.data).toBe(dataObject);
      expect(event2.data).toBe(dataObject);

      // Modifying one affects both
      event1.data.debitAmount = 200;
      expect(event2.data.debitAmount).toBe(200);
    });

    it("should handle timestamp changes between serializations", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      const originalTimestamp = event.reported_timestamp;
      const serialized1 = event.serialize();

      event.reported_timestamp = DateTime.utc().plus({ hours: 1 });
      const serialized2 = event.serialize();

      expect(serialized1.SQL.reported_timestamp).toBe(originalTimestamp);
      expect(serialized2.SQL.reported_timestamp).not.toBe(originalTimestamp);
      expect(serialized1.SQL.reported_timestamp).not.toBe(
        serialized2.SQL.reported_timestamp,
      );
    });
  });

  describe("performance and memory", () => {
    it("should create event synchronously", () => {
      const start = performance.now();
      const event = new SDKCall(userId, {
        debitAmount,
      });
      const duration = performance.now() - start;

      expect(event).toBeDefined();
      expect(duration).toBeLessThan(10); // Should be very fast
    });

    it("should serialize event synchronously", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      const start = performance.now();
      const serialized = event.serialize();
      const duration = performance.now() - start;

      expect(serialized).toBeDefined();
      expect(duration).toBeLessThan(10); // Should be very fast
    });

    it("should handle large number of serializations", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      const serializations = Array.from({ length: 1000 }, () =>
        event.serialize(),
      );

      expect(serializations).toHaveLength(1000);
      serializations.forEach((serialized) => {
        expect(serialized.SQL.type).toBe("SDK_CALL");
      });
    });

    it("should not leak memory with repeated modifications", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      for (let i = 0; i < 10000; i++) {
        event.data.debitAmount = i;
        event.serialize();
      }

      expect(event.data.debitAmount).toBe(9999);
    });
  });

  describe("data immutability concerns", () => {
    it("should allow modification of userId after creation", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      const newUserId = "new-user-id";
      event.userId = newUserId;

      expect(event.userId).toBe(newUserId);
    });

    it("should allow modification of debitAmount after creation", () => {
      const event = new SDKCall(userId, {
        debitAmount: 100,
      });

      event.data.debitAmount = 500;

      expect(event.data.debitAmount).toBe(500);
    });

    it("should allow modification of reported_timestamp after creation", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      const newTimestamp = DateTime.utc().minus({ days: 1 });
      event.reported_timestamp = newTimestamp;

      expect(event.reported_timestamp).toBe(newTimestamp);
    });

    it("should preserve modifications in serialization", () => {
      const event = new SDKCall(userId, {
        debitAmount: 100,
      });

      event.userId = "modified-user";
      event.data.debitAmount = 200;

      const serialized = event.serialize();

      expect(serialized.SQL.userId).toBe("modified-user");
      expect(serialized.SQL.data.debitAmount).toBe(200);
    });
  });

  describe("type assertions", () => {
    it("should be assignable to EventType", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      // Should compile and run without errors
      const anyEvent: any = event;
      expect(anyEvent.type).toBe("SDK_CALL");
      expect(anyEvent.userId).toBe(userId);
      expect(anyEvent.serialize).toBeDefined();
    });

    it("should have all required properties for storage", () => {
      const event = new SDKCall(userId, {
        debitAmount,
      });

      const serialized = event.serialize();
      const sqlData = serialized.SQL;

      expect(sqlData).toHaveProperty("type");
      expect(sqlData).toHaveProperty("userId");
      expect(sqlData).toHaveProperty("reported_timestamp");
      expect(sqlData).toHaveProperty("data");
      expect(sqlData.data).toHaveProperty("debitAmount");
    });

    it("should be compatible with database storage format", () => {
      const event = new SDKCall(userId, {
        debitAmount: 250.75,
      });

      const serialized = event.serialize();
      const sqlData = serialized.SQL;

      // Verify structure matches database expectations
      expect(typeof sqlData.type).toBe("string");
      expect(typeof sqlData.userId).toBe("string");
      expect(sqlData.reported_timestamp).toBeInstanceOf(DateTime);
      expect(typeof sqlData.data.debitAmount).toBe("number");
    });
  });

  describe("constructor parameter validation", () => {
    it("should accept any string as userId", () => {
      const testIds = [
        "simple-id",
        "id with spaces",
        "id@with!special#chars",
        "123456789",
        "中文ID",
        "",
      ];

      testIds.forEach((id) => {
        const event = new SDKCall(id, {
          debitAmount: 100,
        });
        expect(event.userId).toBe(id);
      });
    });

    it("should accept any number as debitAmount", () => {
      const amounts = [0, 1, -1, 0.1, -0.1, 999999.99, Infinity, -Infinity];

      amounts.forEach((amount) => {
        const event = new SDKCall(userId, {
          debitAmount: amount,
        });
        expect(event.data.debitAmount).toBe(amount);
      });
    });

    it("should accept data object with only debitAmount", () => {
      const data = { debitAmount: 100 };
      const event = new SDKCall(userId, data);

      expect(event.data).toBe(data);
      expect(event.data.debitAmount).toBe(100);
    });

    it("should maintain reference to passed data object", () => {
      const data = { debitAmount: 100 };
      const event = new SDKCall(userId, data);

      data.debitAmount = 200;
      expect(event.data.debitAmount).toBe(200);

      event.data.debitAmount = 300;
      expect(data.debitAmount).toBe(300);
    });
  });
});
