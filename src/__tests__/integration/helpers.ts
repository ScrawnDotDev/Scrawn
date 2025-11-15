import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../storage/db/postgres/schema";
import { DateTime } from "luxon";
import { eq } from "drizzle-orm";

export interface TestDatabaseConfig {
  connectionString: string;
}

export class TestDatabase {
  private db: ReturnType<typeof drizzle> | null = null;
  private client: ReturnType<typeof postgres> | null = null;
  private config: TestDatabaseConfig;

  constructor(config: TestDatabaseConfig) {
    this.config = config;
  }

  connect(): ReturnType<typeof drizzle> {
    if (this.db) {
      return this.db;
    }

    this.client = postgres(this.config.connectionString);
    this.db = drizzle({ client: this.client, schema });

    return this.db;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
      this.db = null;
    }
  }

  getDB(): ReturnType<typeof drizzle> {
    if (!this.db) {
      throw new Error("Database not connected. Call connect() first.");
    }
    return this.db;
  }

  async clearAllTables(): Promise<void> {
    const db = this.getDB();
    // Clear in reverse order of foreign key dependencies
    await db.delete(schema.sdkCallEventsTable);
    await db.delete(schema.paymentEventsTable);
    await db.delete(schema.eventsTable);
    await db.delete(schema.usersTable);
  }

  async seedUser(userId: string): Promise<void> {
    const db = this.getDB();
    await db
      .insert(schema.usersTable)
      .values({ id: userId })
      .onConflictDoNothing();
  }

  async seedEvent(
    userId: string,
    reportedTimestamp?: string,
  ): Promise<{ id: string }> {
    const db = this.getDB();
    const ts = reportedTimestamp || DateTime.utc().toSQL();

    if (!ts) {
      throw new Error("Failed to generate timestamp");
    }

    const [result] = await db
      .insert(schema.eventsTable)
      .values({
        reported_timestamp: ts,
        userId,
      })
      .returning({ id: schema.eventsTable.id });

    if (!result) {
      throw new Error("Failed to insert event");
    }

    return result;
  }

  async seedSDKCallEvent(eventId: string, debitAmount: number): Promise<void> {
    const db = this.getDB();
    await db.insert(schema.sdkCallEventsTable).values({
      id: eventId,
      type: "RAW",
      debitAmount,
    });
  }

  async seedPaymentEvent(eventId: string, creditAmount: number): Promise<void> {
    const db = this.getDB();
    await db.insert(schema.paymentEventsTable).values({
      id: eventId,
      creditAmount,
    });
  }

  async getUser(userId: string): Promise<any> {
    const db = this.getDB();
    const users = await db
      .select()
      .from(schema.usersTable)
      .where(eq(schema.usersTable.id, userId));
    return users[0] || null;
  }

  async getEvent(userId: string): Promise<any> {
    const db = this.getDB();
    const events = await db
      .select()
      .from(schema.eventsTable)
      .where(eq(schema.eventsTable.userId, userId));
    return events[0] || null;
  }

  async getSDKCallEvent(eventId: string): Promise<any> {
    const db = this.getDB();
    const events = await db
      .select()
      .from(schema.sdkCallEventsTable)
      .where(eq(schema.sdkCallEventsTable.id, eventId));
    return events[0] || null;
  }

  async countUsers(): Promise<number> {
    const db = this.getDB();
    const result = await db.select().from(schema.usersTable);
    return result.length;
  }

  async countEvents(): Promise<number> {
    const db = this.getDB();
    const result = await db.select().from(schema.eventsTable);
    return result.length;
  }

  async countSDKCallEvents(): Promise<number> {
    const db = this.getDB();
    const result = await db.select().from(schema.sdkCallEventsTable);
    return result.length;
  }

  async getPaymentEvent(eventId: string): Promise<any> {
    const db = this.getDB();
    const events = await db
      .select()
      .from(schema.paymentEventsTable)
      .where(eq(schema.paymentEventsTable.id, eventId));
    return events[0] || null;
  }

  async countPaymentEvents(): Promise<number> {
    const db = this.getDB();
    const result = await db.select().from(schema.paymentEventsTable);
    return result.length;
  }

  // Alias for consistency
  async countSDKCalls(): Promise<number> {
    return this.countSDKCallEvents();
  }

  async countPayments(): Promise<number> {
    return this.countPaymentEvents();
  }
}

export function getTestDatabaseConfig(): TestDatabaseConfig {
  const connectionString =
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgres://localhost:5432/scrawn_test";

  return {
    connectionString,
  };
}

export function createTestDatabase(): TestDatabase {
  const config = getTestDatabaseConfig();
  return new TestDatabase(config);
}

/**
 * Generate a unique user ID for tests
 */
export function generateTestUserId(): string {
  return (
    "test-user-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9)
  );
}

/**
 * Wait for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
