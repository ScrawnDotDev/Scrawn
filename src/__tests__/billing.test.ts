import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DateTime } from "luxon";
import {
  createTestApiKey,
  insertKey,
  TEST_PROJECT_ID,
} from "./fixtures/apiKey";
import { clearDatabase } from "./db";
import { getPostgresDB } from "../storage/db/postgres/db";
import { sessionsTable } from "../storage/db/postgres/schema";
import { ensureUserExists } from "../storage/db/postgres/helpers/users";
import {
  lockUserForBilling,
  getDatabaseNow,
} from "../storage/db/postgres/helpers/billing";
import { calculatePaymentPrice } from "../services/pricingService";
import { BasicUsage } from "../events/BasicUsage";
import { storeEvent } from "../utils/eventHelpers";
import { StorageError } from "../errors/storage";
import type { AuthContext } from "../context/auth";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeBasicUsage(
  userId: string,
  debitAmount: number,
  reportedTimestamp: DateTime = DateTime.utc()
): BasicUsage {
  return new BasicUsage(
    userId,
    reportedTimestamp,
    { basicUsageType: "RAW", debitAmount },
    crypto.randomUUID(),
    crypto.randomUUID()
  );
}

async function storeBasic(
  auth: AuthContext,
  userId: string,
  debitAmount: number,
  reportedTimestamp?: DateTime
): Promise<void> {
  await storeEvent(
    makeBasicUsage(userId, debitAmount, reportedTimestamp),
    auth
  );
}

async function recordPaidSession(
  auth: AuthContext,
  userId: string,
  billedUpto: DateTime
): Promise<void> {
  await getPostgresDB()
    .insert(sessionsTable)
    .values({
      projectId: auth.projectId,
      sessionId: `cks_${crypto.randomUUID()}`,
      processed: "succeeded",
      userId,
      apiKeyId: auth.apiKeyId,
      billed_upto: billedUpto.toISO()!,
      checkoutUrl: "https://example.com/checkout",
      mode: auth.mode!,
    });
}

/** Prices the user and marks that checkout as paid; returns the price. */
async function checkoutAndPay(
  auth: AuthContext,
  userId: string
): Promise<number> {
  const { price, billedUpto } = await calculatePaymentPrice(userId, auth);
  await recordPaidSession(auth, userId, billedUpto);
  return price;
}

async function price(auth: AuthContext, userId: string): Promise<number> {
  return (await calculatePaymentPrice(userId, auth)).price;
}

describe("Billing window", () => {
  let testAuth: AuthContext;
  let productionAuth: AuthContext;

  beforeAll(async () => {
    const testKey = await createTestApiKey();
    testAuth = {
      apiKeyId: testKey.id,
      role: "test",
      mode: "test",
      projectId: TEST_PROJECT_ID,
    };

    const liveKeyId = await insertKey(
      `scrn_live_${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}`,
      "production"
    );
    productionAuth = {
      apiKeyId: liveKeyId,
      role: "production",
      mode: "production",
      projectId: TEST_PROJECT_ID,
    };
  });

  afterAll(async () => {
    await clearDatabase();
  });

  it("bills only usage ingested since the last paid checkout", async () => {
    const userId = crypto.randomUUID();

    await storeBasic(testAuth, userId, 100);
    expect(await checkoutAndPay(testAuth, userId)).toBe(100);
    await storeBasic(testAuth, userId, 40);

    expect(await price(testAuth, userId)).toBe(40);
  });

  it("bills late events whose reported timestamp predates the last payment", async () => {
    const userId = crypto.randomUUID();

    await storeBasic(testAuth, userId, 100);
    await checkoutAndPay(testAuth, userId);
    await storeBasic(testAuth, userId, 25, DateTime.utc().minus({ hours: 1 }));

    expect(await price(testAuth, userId)).toBe(25);
  });

  it("does not let test-mode payments affect production billing", async () => {
    const userId = crypto.randomUUID();

    await storeBasic(productionAuth, userId, 300);
    await checkoutAndPay(testAuth, userId);

    expect(await price(productionAuth, userId)).toBe(300);
  });

  it("does not reopen a billed window when an older checkout is paid last", async () => {
    const userId = crypto.randomUUID();

    await storeBasic(testAuth, userId, 100);
    const older = await calculatePaymentPrice(userId, testAuth);
    await storeBasic(testAuth, userId, 50);
    const newer = await calculatePaymentPrice(userId, testAuth);

    await recordPaidSession(testAuth, userId, newer.billedUpto);
    await recordPaidSession(testAuth, userId, older.billedUpto);
    await storeBasic(testAuth, userId, 7);

    expect(await price(testAuth, userId)).toBe(7);
  });

  it("bills an event that is ingested while a checkout is being priced", async () => {
    const userId = crypto.randomUUID();
    await storeBasic(testAuth, userId, 100);

    // Simulate checkout pricing holding the user lock, and an event arriving
    // in the middle of it. The event must wait, and once the checkout is paid
    // it must still be billable in the next window rather than lost.
    let ingestion: Promise<void> | undefined;
    let ingestionSettled = false;
    const cutoff = await getPostgresDB().transaction(async (txn) => {
      await ensureUserExists(testAuth.projectId, userId, txn);
      await lockUserForBilling(testAuth.projectId, userId, txn);
      const now = await getDatabaseNow(txn);

      ingestion = storeBasic(testAuth, userId, 700).finally(() => {
        ingestionSettled = true;
      });
      await sleep(300);
      expect(ingestionSettled).toBe(false);
      return now;
    });

    await ingestion;
    await recordPaidSession(testAuth, userId, cutoff);

    expect(await price(testAuth, userId)).toBe(700);
  });

  it("accepts exactly one of two concurrent events with the same idempotency key", async () => {
    const userId = crypto.randomUUID();
    const event = makeBasicUsage(userId, 100);

    const results = await Promise.allSettled([
      storeEvent(event, testAuth),
      storeEvent(event, testAuth),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(StorageError);
    expect((rejected[0]!.reason as StorageError).type).toBe(
      "CONSTRAINT_VIOLATION"
    );

    expect(await checkoutAndPay(testAuth, userId)).toBe(100);
    expect(await price(testAuth, userId)).toBe(0);
  });

  it("prices more concurrent checkouts than the connection pool holds", async () => {
    // The Postgres pool has 15 connections. Each checkout holds one for its
    // pricing transaction; if pricing needed a second connection, this many
    // concurrent checkouts would wait on each other forever.
    const userIds = Array.from({ length: 25 }, () => crypto.randomUUID());
    for (const userId of userIds) {
      await storeBasic(testAuth, userId, 10);
    }

    const prices = await Promise.all(
      userIds.map((userId) => price(testAuth, userId))
    );

    expect(prices).toEqual(userIds.map(() => 10));
  }, 15_000);
});
