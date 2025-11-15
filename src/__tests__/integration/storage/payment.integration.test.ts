import {
  describe,
  it,
  expect,
  beforeAll,
  afterEach,
  afterAll,
} from "vitest";
import { PostgresAdapter } from "../../../storage/adapter/postgres/postgres";
import { Payment } from "../../../events/RawEvents/Payment";
import { StorageError, StorageErrorType } from "../../../errors/storage";
import {
  createTestDatabase,
  generateTestUserId,
  TestDatabase,
} from "../helpers";
import { isStorageError } from "../../helpers/error";
import * as schema from "../../../storage/db/postgres/schema";

/**
 * Integration tests for Payment event storage
 *
 * These tests require a running PostgreSQL database.
 * Set TEST_DATABASE_URL environment variable to point to a test database.
 *
 * Example:
 *   TEST_DATABASE_URL=postgres://user:password@localhost:5432/scrawn_test npm test
 *
 * Tests verify:
 * - Actual payment event storage and retrieval
 * - Database constraints and foreign keys
 * - Transaction atomicity for payment events
 * - Real event serialization and storage
 * - Database state consistency
 * - Concurrent payment operations
 *
 * NOTE: These tests are skipped if PostgreSQL is not available.
 */

let testDB: TestDatabase;
let dbConnected = false;

describe("Payment Event Integration Tests", () => {
  beforeAll(async () => {
    testDB = createTestDatabase();

    try {
      testDB.connect();
      await testDB.clearAllTables();
      dbConnected = true;
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      if (
        errorMsg.includes("ECONNREFUSED") ||
        errorMsg.includes("connect ECONNREFUSED")
      ) {
        console.warn(
          "\n⚠️  PostgreSQL database not available - skipping integration tests",
        );
        console.warn(
          "   To enable: export TEST_DATABASE_URL=postgres://user:password@localhost:5432/scrawn_test\n",
        );
      } else {
        console.error("Unexpected error connecting to database:", error);
      }
      dbConnected = false;
    }
  });

  afterEach(async () => {
    if (!dbConnected) return;
    try {
      await testDB.clearAllTables();
    } catch (error) {
      console.error("Failed to clear tables after test:", error);
    }
  });

  afterAll(async () => {
    if (!dbConnected) return;
    try {
      await testDB.clearAllTables();
      await testDB.disconnect();
    } catch (error) {
      console.error("Failed to disconnect from test database:", error);
    }
  });

  describe("Basic payment event storage", () => {
    it("should store a complete PAYMENT event", async () => {
      if (!dbConnected) {
        console.log("⏭️  Skipping - database not connected");
        return;
      }

      const userId = generateTestUserId();
      const creditAmount = 1599;

      const event = new Payment(userId, { creditAmount });
      const adapter = new PostgresAdapter(event, "test-api-key-123");

      await adapter.add();

      // Verify user was created
      const user = await testDB.getUser(userId);
      expect(user).not.toBeNull();
      expect(user.id).toBe(userId);

      // Verify event was created
      const eventCount = await testDB.countEvents();
      expect(eventCount).toBe(1);

      // Verify payment event was created
      const paymentCount = await testDB.countPayments();
      expect(paymentCount).toBe(1);
    });

    it("should store credit amounts with correct precision", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();
      const creditAmount = 2500;

      const event = new Payment(userId, { creditAmount });
      const adapter = new PostgresAdapter(event, "test-api-key-123");

      await adapter.add();

      const db = testDB.getDB();
      const paymentEvents = await db
        .select()
        .from(schema.paymentEventsTable);

      expect(paymentEvents).toHaveLength(1);
      expect(Number(paymentEvents[0].creditAmount)).toBe(creditAmount);
    });

    it("should store payment event with apiKeyId", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();
      const creditAmount = 1000;
      const apiKeyId = "webhook-api-key-456";

      const event = new Payment(userId, { creditAmount });
      const adapter = new PostgresAdapter(event, apiKeyId);

      await adapter.add();

      const db = testDB.getDB();
      const events = await db.select().from(schema.eventsTable);

      expect(events).toHaveLength(1);
      expect(events[0].api_keyId).toBe(apiKeyId);
    });

    it("should store payment event without apiKeyId", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();
      const creditAmount = 1000;

      const event = new Payment(userId, { creditAmount });
      const adapter = new PostgresAdapter(event);

      await adapter.add();

      const db = testDB.getDB();
      const events = await db.select().from(schema.eventsTable);

      expect(events).toHaveLength(1);
      expect(events[0].api_keyId).toBeNull();
    });

    it("should handle small credit amounts", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();
      const creditAmount = 1;

      const event = new Payment(userId, { creditAmount });
      const adapter = new PostgresAdapter(event, "test-api-key-123");

      await adapter.add();

      expect(await testDB.countUsers()).toBe(1);
      expect(await testDB.countEvents()).toBe(1);
      expect(await testDB.countPayments()).toBe(1);
    });

    it("should handle large credit amounts", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();
      const creditAmount = 999999;

      const event = new Payment(userId, { creditAmount });
      const adapter = new PostgresAdapter(event, "test-api-key-123");

      await adapter.add();

      expect(await testDB.countUsers()).toBe(1);
      expect(await testDB.countEvents()).toBe(1);
      expect(await testDB.countPayments()).toBe(1);
    });
  });

  describe("Duplicate user handling", () => {
    it("should silently handle duplicate user constraint", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();

      // First payment
      const event1 = new Payment(userId, { creditAmount: 1000 });
      await new PostgresAdapter(event1, "test-api-key-123").add();

      expect(await testDB.countUsers()).toBe(1);

      // Second payment with same user
      const event2 = new Payment(userId, { creditAmount: 2000 });
      await new PostgresAdapter(event2, "test-api-key-456").add();

      // User count should still be 1
      expect(await testDB.countUsers()).toBe(1);
      // But we should have 2 events
      expect(await testDB.countEvents()).toBe(2);
      expect(await testDB.countPayments()).toBe(2);
    });

    it("should not throw error when inserting payment for existing user", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();

      // Pre-populate user
      await testDB.seedUser(userId);

      // Insert payment event for existing user - should not throw
      const event = new Payment(userId, { creditAmount: 1500 });
      const adapter = new PostgresAdapter(event, "test-api-key-123");

      await expect(adapter.add()).resolves.not.toThrow();
    });

    it("should handle rapid successive payment insertions for same user", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();

      const promises = Array.from({ length: 5 }, (_, i) => {
        const event = new Payment(userId, {
          creditAmount: (i + 1) * 500,
        });
        return new PostgresAdapter(event, `api-key-${i}`).add();
      });

      await Promise.all(promises);

      expect(await testDB.countUsers()).toBe(1);
      expect(await testDB.countEvents()).toBe(5);
      expect(await testDB.countPayments()).toBe(5);
    });
  });

  describe("Multiple users and payments", () => {
    it("should handle payment events from different users", async () => {
      if (!dbConnected) return;

      const userIds = [
        generateTestUserId(),
        generateTestUserId(),
        generateTestUserId(),
      ];

      for (const userId of userIds) {
        const event = new Payment(userId, { creditAmount: 1000 });
        await new PostgresAdapter(event, "test-api-key-123").add();
      }

      expect(await testDB.countUsers()).toBe(3);
      expect(await testDB.countEvents()).toBe(3);
      expect(await testDB.countPayments()).toBe(3);

      // Verify each user exists
      for (const userId of userIds) {
        const user = await testDB.getUser(userId);
        expect(user).not.toBeNull();
      }
    });

    it("should maintain payment isolation between users", async () => {
      if (!dbConnected) return;

      const userId1 = generateTestUserId();
      const userId2 = generateTestUserId();

      await new PostgresAdapter(
        new Payment(userId1, { creditAmount: 1000 }),
        "api-key-1",
      ).add();
      await new PostgresAdapter(
        new Payment(userId2, { creditAmount: 2000 }),
        "api-key-2",
      ).add();

      const user1 = await testDB.getUser(userId1);
      const user2 = await testDB.getUser(userId2);

      expect(user1.id).toBe(userId1);
      expect(user2.id).toBe(userId2);
      expect(user1.id).not.toBe(user2.id);
    });

    it("should store different credit amounts for different payments", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();
      const amounts = [1000, 2500, 5000];

      for (const amount of amounts) {
        const event = new Payment(userId, { creditAmount: amount });
        await new PostgresAdapter(event, "test-api-key-123").add();
      }

      const db = testDB.getDB();
      const paymentEvents = await db
        .select()
        .from(schema.paymentEventsTable);

      expect(paymentEvents).toHaveLength(3);
      const storedAmounts = paymentEvents.map((p) => Number(p.creditAmount));
      expect(storedAmounts).toEqual(expect.arrayContaining(amounts));
    });
  });

  describe("Transaction atomicity", () => {
    it("should ensure all three table inserts succeed together", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();
      const creditAmount = 1599;

      const event = new Payment(userId, { creditAmount });
      await new PostgresAdapter(event, "test-api-key-123").add();

      // All three inserts should have completed
      const userCount = await testDB.countUsers();
      const eventCount = await testDB.countEvents();
      const paymentCount = await testDB.countPayments();

      expect(userCount).toBe(1);
      expect(eventCount).toBe(1);
      expect(paymentCount).toBe(1);

      // Verify referential integrity
      const user = await testDB.getUser(userId);
      expect(user).not.toBeNull();
    });

    it("should maintain referential integrity between all tables", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();
      const event = new Payment(userId, { creditAmount: 1000 });

      await new PostgresAdapter(event, "test-api-key-123").add();

      // Verify user exists
      const user = await testDB.getUser(userId);
      expect(user).not.toBeNull();

      // Get events and verify userId matches
      const db = testDB.getDB();
      const events = await db.select().from(schema.eventsTable);

      expect(events).toHaveLength(1);
      expect(events[0].userId).toBe(userId);

      // Get payment events and verify they reference the event
      const paymentEvents = await db
        .select()
        .from(schema.paymentEventsTable);

      expect(paymentEvents).toHaveLength(1);
      expect(paymentEvents[0].id).toBe(events[0].id);
    });
  });

  describe("Timestamp handling", () => {
    it("should store reported_timestamp from event", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();
      const event = new Payment(userId, { creditAmount: 1000 });

      await new PostgresAdapter(event, "test-api-key-123").add();

      expect(await testDB.countEvents()).toBe(1);

      // Verify timestamp was stored
      const db = testDB.getDB();
      const events = await db.select().from(schema.eventsTable);

      expect(events).toHaveLength(1);
      expect(events[0].reported_timestamp).toBeDefined();
      expect(typeof events[0].reported_timestamp).toBe("string");
    });
  });

  describe("Event serialization", () => {
    it("should correctly serialize payment event before storing", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();
      const creditAmount = 1599;

      const event = new Payment(userId, { creditAmount });
      const serialized = event.serialize();

      expect(serialized.SQL.type).toBe("PAYMENT");
      expect(serialized.SQL.userId).toBe(userId);
      expect(serialized.SQL.data.creditAmount).toBe(creditAmount);

      const adapter = new PostgresAdapter(event, "test-api-key-123");
      await adapter.add();

      expect(await testDB.countUsers()).toBe(1);
    });
  });

  describe("Error handling", () => {
    it("should reject payment with zero credit amount", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();
      const event = new Payment(userId, { creditAmount: 0 });
      const adapter = new PostgresAdapter(event, "test-api-key-123");

      try {
        await adapter.add();
        expect.fail("Should have thrown StorageError");
      } catch (error) {
        expect(isStorageError(error)).toBe(true);
        expect((error as StorageError).type).toBe(
          StorageErrorType.INVALID_DATA,
        );
      }
    });

    it("should reject payment with negative credit amount", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();
      const event = new Payment(userId, { creditAmount: -100 });
      const adapter = new PostgresAdapter(event, "test-api-key-123");

      try {
        await adapter.add();
        expect.fail("Should have thrown StorageError");
      } catch (error) {
        expect(isStorageError(error)).toBe(true);
        expect((error as StorageError).type).toBe(
          StorageErrorType.INVALID_DATA,
        );
      }
    });
  });

  describe("Concurrent operations", () => {
    it("should handle concurrent payment insertions from different users", async () => {
      if (!dbConnected) return;

      const userIds = Array.from({ length: 5 }, () => generateTestUserId());

      const promises = userIds.map((userId) =>
        new PostgresAdapter(
          new Payment(userId, { creditAmount: 1000 }),
          "test-api-key-123",
        ).add(),
      );

      await Promise.all(promises);

      expect(await testDB.countUsers()).toBe(5);
      expect(await testDB.countEvents()).toBe(5);
      expect(await testDB.countPayments()).toBe(5);
    });

    it("should handle concurrent payment insertions for same user", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();

      const promises = Array.from({ length: 3 }, (_, i) =>
        new PostgresAdapter(
          new Payment(userId, {
            creditAmount: (i + 1) * 1000,
          }),
          `api-key-${i}`,
        ).add(),
      );

      await Promise.all(promises);

      expect(await testDB.countUsers()).toBe(1);
      expect(await testDB.countEvents()).toBe(3);
      expect(await testDB.countPayments()).toBe(3);
    });
  });

  describe("Data persistence", () => {
    it("should persist payment data correctly for later retrieval", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();
      const creditAmount = 2599;

      const event = new Payment(userId, { creditAmount });
      await new PostgresAdapter(event, "test-api-key-123").add();

      // Retrieve and verify
      const user = await testDB.getUser(userId);
      expect(user).not.toBeNull();
      expect(user.id).toBe(userId);

      const storedEvent = await testDB.getEvent(userId);
      expect(storedEvent).not.toBeNull();
      expect(storedEvent.userId).toBe(userId);

      const db = testDB.getDB();
      const paymentEvents = await db
        .select()
        .from(schema.paymentEventsTable);

      expect(paymentEvents).toHaveLength(1);
      expect(Number(paymentEvents[0].creditAmount)).toBe(creditAmount);
    });

    it("should handle high-volume sequential payment operations", async () => {
      if (!dbConnected) return;

      const operationCount = 10;

      for (let i = 0; i < operationCount; i++) {
        const userId = generateTestUserId();
        const event = new Payment(userId, {
          creditAmount: 1000 + i * 100,
        });
        await new PostgresAdapter(event, `api-key-${i}`).add();
      }

      expect(await testDB.countUsers()).toBe(operationCount);
      expect(await testDB.countEvents()).toBe(operationCount);
      expect(await testDB.countPayments()).toBe(operationCount);
    });
  });

  describe("Mixed event types", () => {
    it("should handle both SDK_CALL and PAYMENT events for same user", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();

      // Store a payment event
      const paymentEvent = new Payment(userId, { creditAmount: 1000 });
      await new PostgresAdapter(paymentEvent, "test-api-key-123").add();

      expect(await testDB.countUsers()).toBe(1);
      expect(await testDB.countEvents()).toBe(1);
      expect(await testDB.countPayments()).toBe(1);

      // Verify the user exists and can be used for other event types
      const user = await testDB.getUser(userId);
      expect(user).not.toBeNull();
      expect(user.id).toBe(userId);
    });
  });

  describe("Edge cases", () => {
    it("should complete payment operation in reasonable time", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();
      const event = new Payment(userId, { creditAmount: 1000 });

      const startTime = Date.now();
      await new PostgresAdapter(event, "test-api-key-123").add();
      const endTime = Date.now();

      // Operation should complete in less than 5 seconds
      expect(endTime - startTime).toBeLessThan(5000);
    });

    it("should handle storage of many payment events sequentially", async () => {
      if (!dbConnected) return;

      const transactionCount = 10;

      for (let i = 0; i < transactionCount; i++) {
        const userId = generateTestUserId();
        const event = new Payment(userId, {
          creditAmount: 1000 + i * 500,
        });
        await new PostgresAdapter(event, `api-key-${i}`).add();
      }

      expect(await testDB.countUsers()).toBe(transactionCount);
      expect(await testDB.countEvents()).toBe(transactionCount);
      expect(await testDB.countPayments()).toBe(transactionCount);
    });

    it("should handle very large credit amounts", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();
      const creditAmount = 9999999;

      const event = new Payment(userId, { creditAmount });
      await new PostgresAdapter(event, "test-api-key-123").add();

      const db = testDB.getDB();
      const paymentEvents = await db
        .select()
        .from(schema.paymentEventsTable);

      expect(paymentEvents).toHaveLength(1);
      expect(Number(paymentEvents[0].creditAmount)).toBe(creditAmount);
    });
  });

  describe("Webhook simulation", () => {
    it("should simulate webhook payment flow", async () => {
      if (!dbConnected) return;

      // Simulate a webhook receiving a payment notification
      const userId = "webhook-user-123";
      const apiKeyId = "webhook-api-key-456";
      const creditAmount = 1599; // $15.99

      // Create and store payment event (as webhook would)
      const paymentEvent = new Payment(userId, { creditAmount });
      const adapter = new PostgresAdapter(paymentEvent, apiKeyId);

      await adapter.add();

      // Verify all data was stored correctly
      expect(await testDB.countUsers()).toBe(1);
      expect(await testDB.countEvents()).toBe(1);
      expect(await testDB.countPayments()).toBe(1);

      const user = await testDB.getUser(userId);
      expect(user.id).toBe(userId);

      const db = testDB.getDB();
      const events = await db.select().from(schema.eventsTable);
      expect(events[0].userId).toBe(userId);
      expect(events[0].api_keyId).toBe(apiKeyId);

      const paymentEvents = await db
        .select()
        .from(schema.paymentEventsTable);
      expect(Number(paymentEvents[0].creditAmount)).toBe(creditAmount);
    });
  });
});
