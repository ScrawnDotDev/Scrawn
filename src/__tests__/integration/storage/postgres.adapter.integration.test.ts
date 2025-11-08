import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { PostgresAdapter } from "../../../storage/adapter/postgres";
import { ServerlessFunctionCallEvent } from "../../../events/ServerlessFunctionCallEvent";
import { StorageError, StorageErrorType } from "../../../errors/storage";
import {
  createTestDatabase,
  generateTestUserId,
  TestDatabase,
} from "../helpers";
import { isStorageError } from "../../helpers/error";
import { eq } from "drizzle-orm";
import * as schema from "../../../storage/db/postgres/schema";

/**
 * Integration tests for PostgreSQL storage adapter
 *
 * These tests require a running PostgreSQL database.
 * Set TEST_DATABASE_URL environment variable to point to a test database.
 *
 * Example:
 *   TEST_DATABASE_URL=postgres://user:password@localhost:5432/scrawn_test npm test
 *
 * Tests verify:
 * - Actual transaction behavior and atomicity
 * - Database constraints and foreign keys
 * - Real event serialization and storage
 * - Database state consistency
 * - Concurrent operations
 *
 * NOTE: These tests are skipped if PostgreSQL is not available.
 */

let testDB: TestDatabase;
let dbConnected = false;

describe("PostgresAdapter Integration Tests", () => {
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

  describe("Basic event storage", () => {
    it("should store a complete SERVERLESS_FUNCTION_CALL event", async () => {
      if (!dbConnected) {
        console.log("⏭️  Skipping - database not connected");
        return;
      }

      const userId = generateTestUserId();
      const debitAmount = 100;

      const event = new ServerlessFunctionCallEvent(userId, { debitAmount });
      const adapter = new PostgresAdapter(event);

      await adapter.add();

      // Verify user was created
      const user = await testDB.getUser(userId);
      expect(user).not.toBeNull();
      expect(user.id).toBe(userId);

      // Verify event was created
      const eventCount = await testDB.countEvents();
      expect(eventCount).toBe(1);

      // Verify serverless function call event was created
      const sfceCount = await testDB.countServerlessFunctionCallEvents();
      expect(sfceCount).toBe(1);
    });

    it("should store debit amounts with correct precision", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();
      const debitAmount = 250.75;

      const event = new ServerlessFunctionCallEvent(userId, { debitAmount });
      const adapter = new PostgresAdapter(event);

      await adapter.add();

      const db = testDB.getDB();
      const sfcEvents = await db
        .select()
        .from(schema.serverlessFunctionCallEventsTable);

      expect(sfcEvents).toHaveLength(1);
      expect(Number(sfcEvents[0].debitAmount)).toBe(debitAmount);
    });

    it("should handle zero debit amount", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();
      const debitAmount = 0;

      const event = new ServerlessFunctionCallEvent(userId, { debitAmount });
      const adapter = new PostgresAdapter(event);

      await adapter.add();

      expect(await testDB.countUsers()).toBe(1);
      expect(await testDB.countEvents()).toBe(1);
      expect(await testDB.countServerlessFunctionCallEvents()).toBe(1);
    });

    it("should handle large debit amounts", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();
      const debitAmount = 999999.99;

      const event = new ServerlessFunctionCallEvent(userId, { debitAmount });
      const adapter = new PostgresAdapter(event);

      await adapter.add();

      expect(await testDB.countUsers()).toBe(1);
      expect(await testDB.countEvents()).toBe(1);
    });

    it("should handle negative debit amounts", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();
      const debitAmount = -50.5;

      const event = new ServerlessFunctionCallEvent(userId, { debitAmount });
      const adapter = new PostgresAdapter(event);

      await adapter.add();

      expect(await testDB.countUsers()).toBe(1);
      expect(await testDB.countEvents()).toBe(1);
    });

    it("should handle decimal precision", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();
      const debitAmount = 123.456789;

      const event = new ServerlessFunctionCallEvent(userId, { debitAmount });
      const adapter = new PostgresAdapter(event);

      await adapter.add();

      const db = testDB.getDB();
      const sfcEvents = await db
        .select()
        .from(schema.serverlessFunctionCallEventsTable);

      expect(sfcEvents).toHaveLength(1);
      expect(Number(sfcEvents[0].debitAmount)).toBeCloseTo(debitAmount, 5);
    });
  });

  describe("Duplicate user handling", () => {
    it("should silently handle duplicate user constraint", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();

      // First event
      const event1 = new ServerlessFunctionCallEvent(userId, {
        debitAmount: 100,
      });
      await new PostgresAdapter(event1).add();

      expect(await testDB.countUsers()).toBe(1);

      // Second event with same user
      const event2 = new ServerlessFunctionCallEvent(userId, {
        debitAmount: 200,
      });
      await new PostgresAdapter(event2).add();

      // User count should still be 1
      expect(await testDB.countUsers()).toBe(1);
      // But we should have 2 events
      expect(await testDB.countEvents()).toBe(2);
      expect(await testDB.countServerlessFunctionCallEvents()).toBe(2);
    });

    it("should not throw error when inserting duplicate user", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();

      // Pre-populate user
      await testDB.seedUser(userId);

      // Insert event for existing user - should not throw
      const event = new ServerlessFunctionCallEvent(userId, {
        debitAmount: 100,
      });
      const adapter = new PostgresAdapter(event);

      await expect(adapter.add()).resolves.not.toThrow();
    });

    it("should handle rapid successive insertions for same user", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();

      const promises = Array.from({ length: 5 }, (_, i) => {
        const event = new ServerlessFunctionCallEvent(userId, {
          debitAmount: (i + 1) * 50,
        });
        return new PostgresAdapter(event).add();
      });

      await Promise.all(promises);

      expect(await testDB.countUsers()).toBe(1);
      expect(await testDB.countEvents()).toBe(5);
      expect(await testDB.countServerlessFunctionCallEvents()).toBe(5);
    });
  });

  describe("Multiple users", () => {
    it("should handle events from different users", async () => {
      if (!dbConnected) return;

      const userIds = [
        generateTestUserId(),
        generateTestUserId(),
        generateTestUserId(),
      ];

      for (const userId of userIds) {
        const event = new ServerlessFunctionCallEvent(userId, {
          debitAmount: 100,
        });
        await new PostgresAdapter(event).add();
      }

      expect(await testDB.countUsers()).toBe(3);
      expect(await testDB.countEvents()).toBe(3);
      expect(await testDB.countServerlessFunctionCallEvents()).toBe(3);

      // Verify each user exists
      for (const userId of userIds) {
        const user = await testDB.getUser(userId);
        expect(user).not.toBeNull();
      }
    });

    it("should maintain user isolation", async () => {
      if (!dbConnected) return;

      const userId1 = generateTestUserId();
      const userId2 = generateTestUserId();

      await new PostgresAdapter(
        new ServerlessFunctionCallEvent(userId1, { debitAmount: 100 }),
      ).add();
      await new PostgresAdapter(
        new ServerlessFunctionCallEvent(userId2, { debitAmount: 200 }),
      ).add();

      const user1 = await testDB.getUser(userId1);
      const user2 = await testDB.getUser(userId2);

      expect(user1.id).toBe(userId1);
      expect(user2.id).toBe(userId2);
      expect(user1.id).not.toBe(user2.id);
    });
  });

  describe("Transaction atomicity", () => {
    it("should ensure all three table inserts succeed together", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();
      const debitAmount = 150;

      const event = new ServerlessFunctionCallEvent(userId, { debitAmount });
      await new PostgresAdapter(event).add();

      // All three inserts should have completed
      const userCount = await testDB.countUsers();
      const eventCount = await testDB.countEvents();
      const sfceCount = await testDB.countServerlessFunctionCallEvents();

      expect(userCount).toBe(1);
      expect(eventCount).toBe(1);
      expect(sfceCount).toBe(1);

      // Verify referential integrity
      const user = await testDB.getUser(userId);
      expect(user).not.toBeNull();
    });

    it("should maintain referential integrity between all tables", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();
      const event = new ServerlessFunctionCallEvent(userId, {
        debitAmount: 100,
      });

      await new PostgresAdapter(event).add();

      // Verify user exists
      const user = await testDB.getUser(userId);
      expect(user).not.toBeNull();

      // Get events and verify userId matches
      const db = testDB.getDB();
      const events = await db.select().from(schema.eventsTable);

      expect(events).toHaveLength(1);
      expect(events[0].userId).toBe(userId);
    });
  });

  describe("Timestamp handling", () => {
    it("should store reported_timestamp from event", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();
      const event = new ServerlessFunctionCallEvent(userId, {
        debitAmount: 100,
      });

      await new PostgresAdapter(event).add();

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
    it("should correctly serialize event before storing", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();
      const debitAmount = 123.45;

      const event = new ServerlessFunctionCallEvent(userId, { debitAmount });
      const serialized = event.serialize();

      expect(serialized.SQL.type).toBe("SERVERLESS_FUNCTION_CALL");
      expect(serialized.SQL.userId).toBe(userId);
      expect(serialized.SQL.data.debitAmount).toBe(debitAmount);

      const adapter = new PostgresAdapter(event);
      await adapter.add();

      expect(await testDB.countUsers()).toBe(1);
    });
  });

  describe("Error handling", () => {
    it("should throw StorageError for unknown event type", async () => {
      if (!dbConnected) return;

      const invalidEvent = {
        type: "INVALID_TYPE",
        serialize: () => ({}),
      } as any;

      const adapter = new PostgresAdapter(invalidEvent);

      try {
        await adapter.add();
        expect.fail("Should have thrown StorageError");
      } catch (error) {
        expect(isStorageError(error)).toBe(true);
        expect((error as StorageError).type).toBe(
          StorageErrorType.UNKNOWN_EVENT_TYPE,
        );
      }
    });
  });

  describe("Concurrent operations", () => {
    it("should handle concurrent inserts from different users", async () => {
      if (!dbConnected) return;

      const userIds = Array.from({ length: 5 }, () => generateTestUserId());

      const promises = userIds.map((userId) =>
        new PostgresAdapter(
          new ServerlessFunctionCallEvent(userId, { debitAmount: 100 }),
        ).add(),
      );

      await Promise.all(promises);

      expect(await testDB.countUsers()).toBe(5);
      expect(await testDB.countEvents()).toBe(5);
      expect(await testDB.countServerlessFunctionCallEvents()).toBe(5);
    });

    it("should handle concurrent inserts for same user", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();

      const promises = Array.from({ length: 3 }, (_, i) =>
        new PostgresAdapter(
          new ServerlessFunctionCallEvent(userId, {
            debitAmount: (i + 1) * 10,
          }),
        ).add(),
      );

      await Promise.all(promises);

      expect(await testDB.countUsers()).toBe(1);
      expect(await testDB.countEvents()).toBe(3);
      expect(await testDB.countServerlessFunctionCallEvents()).toBe(3);
    });
  });

  describe("Data persistence", () => {
    it("should persist data correctly for later retrieval", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();
      const debitAmount = 175.75;

      const event = new ServerlessFunctionCallEvent(userId, { debitAmount });
      await new PostgresAdapter(event).add();

      // Retrieve and verify
      const user = await testDB.getUser(userId);
      expect(user).not.toBeNull();
      expect(user.id).toBe(userId);

      const storedEvent = await testDB.getEvent(userId);
      expect(storedEvent).not.toBeNull();
      expect(storedEvent.userId).toBe(userId);
    });

    it("should handle high-volume sequential operations", async () => {
      if (!dbConnected) return;

      const operationCount = 10;

      for (let i = 0; i < operationCount; i++) {
        const userId = generateTestUserId();
        const event = new ServerlessFunctionCallEvent(userId, {
          debitAmount: 100 + i,
        });
        await new PostgresAdapter(event).add();
      }

      expect(await testDB.countUsers()).toBe(operationCount);
      expect(await testDB.countEvents()).toBe(operationCount);
    });
  });

  describe("Edge cases", () => {
    it("should complete operation in reasonable time", async () => {
      if (!dbConnected) return;

      const userId = generateTestUserId();
      const event = new ServerlessFunctionCallEvent(userId, {
        debitAmount: 100,
      });

      const startTime = Date.now();
      await new PostgresAdapter(event).add();
      const endTime = Date.now();

      // Operation should complete in less than 5 seconds
      expect(endTime - startTime).toBeLessThan(5000);
    });

    it("should handle storage of many events sequentially", async () => {
      if (!dbConnected) return;

      const transactionCount = 10;

      for (let i = 0; i < transactionCount; i++) {
        const userId = generateTestUserId();
        const event = new ServerlessFunctionCallEvent(userId, {
          debitAmount: i * 10,
        });
        await new PostgresAdapter(event).add();
      }

      expect(await testDB.countUsers()).toBe(transactionCount);
      expect(await testDB.countEvents()).toBe(transactionCount);
      expect(await testDB.countServerlessFunctionCallEvents()).toBe(
        transactionCount,
      );
    });
  });
});
