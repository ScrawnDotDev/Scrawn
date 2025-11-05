import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventRepository } from "../../../storage/adapters/postgres/EventRepository";
import { PostgresStorageError } from "../../../errors/postgres-storage";

// Mock drizzle transaction
const createMockTransaction = () => {
  const insertMock = vi.fn().mockReturnThis();
  const valuesMock = vi.fn().mockReturnThis();
  const returningMock = vi.fn();

  return {
    insert: insertMock,
    values: valuesMock,
    returning: returningMock,
    insertMock,
    valuesMock,
    returningMock,
  };
};

describe("EventRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("insertOrSkipUser", () => {
    it("should insert new user successfully", async () => {
      const txn = createMockTransaction();
      txn.insertMock.mockReturnValue({
        values: txn.valuesMock,
      });
      txn.valuesMock.mockResolvedValue(undefined);

      const userId = "user-123-uuid";
      await EventRepository.insertOrSkipUser(txn as any, userId);

      expect(txn.insertMock).toHaveBeenCalled();
      expect(txn.valuesMock).toHaveBeenCalledWith({ id: userId });
    });

    it("should skip insertion if user already exists (duplicate key)", async () => {
      const txn = createMockTransaction();
      const duplicateError = new Error(
        "duplicate key value violates unique constraint",
      );

      txn.insertMock.mockReturnValue({
        values: txn.valuesMock,
      });
      txn.valuesMock.mockRejectedValue(duplicateError);

      const userId = "existing-user-id";
      await expect(
        EventRepository.insertOrSkipUser(txn as any, userId),
      ).resolves.toBeUndefined();
    });

    it("should throw PostgresStorageError for non-duplicate errors", async () => {
      const txn = createMockTransaction();
      const pgError = new Error("some other database error");

      txn.insertMock.mockReturnValue({
        values: txn.valuesMock,
      });
      txn.valuesMock.mockRejectedValue(pgError);

      const userId = "user-123";
      try {
        await EventRepository.insertOrSkipUser(txn as any, userId);
        expect.fail("Should have thrown PostgresStorageError");
      } catch (error) {
        expect((error as any).name).toBe("PostgresStorageError");
      }
    });

    it("should convert non-Error objects to Error", async () => {
      const txn = createMockTransaction();
      txn.insertMock.mockReturnValue({
        values: txn.valuesMock,
      });
      txn.valuesMock.mockRejectedValue("string error");

      const userId = "user-123";
      try {
        await EventRepository.insertOrSkipUser(txn as any, userId);
        expect.fail("Should have thrown PostgresStorageError");
      } catch (error) {
        expect((error as any).name).toBe("PostgresStorageError");
      }
    });

    it("should handle multiple user insertions in sequence", async () => {
      const txn = createMockTransaction();
      txn.insertMock.mockReturnValue({
        values: txn.valuesMock,
      });
      txn.valuesMock.mockResolvedValue(undefined);

      const userIds = ["user-1", "user-2", "user-3"];
      for (const userId of userIds) {
        await EventRepository.insertOrSkipUser(txn as any, userId);
      }

      expect(txn.valuesMock).toHaveBeenCalledTimes(3);
    });
  });

  describe("insertEvent", () => {
    it("should insert event and return generated ID", async () => {
      const txn = createMockTransaction();
      const generatedId = "event-uuid-12345";

      txn.insertMock.mockReturnValue({
        values: txn.valuesMock,
      });
      txn.valuesMock.mockReturnValue({
        returning: txn.returningMock,
      });
      txn.returningMock.mockResolvedValue([{ id: generatedId }]);

      const reportedTimestamp = "2024-01-15T10:30:00.000Z";
      const userId = "user-456";

      const result = await EventRepository.insertEvent(
        txn as any,
        reportedTimestamp,
        userId,
      );

      expect(result).toBe(generatedId);
      expect(txn.valuesMock).toHaveBeenCalledWith({
        reported_timestamp: reportedTimestamp,
        userId: userId,
      });
    });

    it("should throw when no ID returned from database", async () => {
      const txn = createMockTransaction();
      txn.insertMock.mockReturnValue({
        values: txn.valuesMock,
      });
      txn.valuesMock.mockReturnValue({
        returning: txn.returningMock,
      });
      txn.returningMock.mockResolvedValue([{}]); // No ID in response

      const reportedTimestamp = "2024-01-15T10:30:00.000Z";
      const userId = "user-456";

      try {
        await EventRepository.insertEvent(
          txn as any,
          reportedTimestamp,
          userId,
        );
        expect.fail("Should have thrown PostgresStorageError");
      } catch (error) {
        expect((error as any).name).toBe("PostgresStorageError");
        expect((error as any).type).toBe("QUERY_FAILED");
      }
    });

    it("should throw when returning is empty array", async () => {
      const txn = createMockTransaction();
      txn.insertMock.mockReturnValue({
        values: txn.valuesMock,
      });
      txn.valuesMock.mockReturnValue({
        returning: txn.returningMock,
      });
      txn.returningMock.mockResolvedValue([]); // Empty result

      const reportedTimestamp = "2024-01-15T10:30:00.000Z";
      const userId = "user-456";

      try {
        await EventRepository.insertEvent(
          txn as any,
          reportedTimestamp,
          userId,
        );
        expect.fail("Should have thrown PostgresStorageError");
      } catch (error) {
        expect((error as any).name).toBe("PostgresStorageError");
        expect((error as any).type).toBe("QUERY_FAILED");
      }
    });

    it("should re-throw PostgresStorageError without wrapping", async () => {
      const txn = createMockTransaction();
      const postgresError = PostgresStorageError.queryFailed("Query failed");

      txn.insertMock.mockReturnValue({
        values: txn.valuesMock,
      });
      txn.valuesMock.mockReturnValue({
        returning: txn.returningMock,
      });
      txn.returningMock.mockRejectedValue(postgresError);

      const reportedTimestamp = "2024-01-15T10:30:00.000Z";
      const userId = "user-456";

      try {
        await EventRepository.insertEvent(
          txn as any,
          reportedTimestamp,
          userId,
        );
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as any).name).toBe("PostgresStorageError");
        expect((error as any).type).toBe("QUERY_FAILED");
      }
    });

    it("should wrap non-PostgresStorageError in PostgresStorageError", async () => {
      const txn = createMockTransaction();
      const randomError = new Error("Unexpected error");

      txn.insertMock.mockReturnValue({
        values: txn.valuesMock,
      });
      txn.valuesMock.mockReturnValue({
        returning: txn.returningMock,
      });
      txn.returningMock.mockRejectedValue(randomError);

      const reportedTimestamp = "2024-01-15T10:30:00.000Z";
      const userId = "user-456";

      try {
        await EventRepository.insertEvent(
          txn as any,
          reportedTimestamp,
          userId,
        );
        expect.fail("Should have thrown PostgresStorageError");
      } catch (error) {
        expect((error as any).name).toBe("PostgresStorageError");
      }
    });

    it("should handle different timestamp formats", async () => {
      const txn = createMockTransaction();
      const generatedId = "event-uuid-456";

      txn.insertMock.mockReturnValue({
        values: txn.valuesMock,
      });
      txn.valuesMock.mockReturnValue({
        returning: txn.returningMock,
      });
      txn.returningMock.mockResolvedValue([{ id: generatedId }]);

      const timestamps = [
        "2024-01-15T10:30:00.000Z",
        "2024-01-15T10:30:00+00:00",
        "2024-01-15 10:30:00",
      ];

      for (const timestamp of timestamps) {
        const result = await EventRepository.insertEvent(
          txn as any,
          timestamp,
          "user-456",
        );
        expect(result).toBe(generatedId);
      }
    });
  });

  describe("insertServerlessFunctionCallEventDetails", () => {
    it("should insert serverless function call event details", async () => {
      const txn = createMockTransaction();
      txn.insertMock.mockReturnValue({
        values: txn.valuesMock,
      });
      txn.valuesMock.mockResolvedValue(undefined);

      const eventId = "event-uuid-789";
      const debitAmount = 150.75;

      await EventRepository.insertServerlessFunctionCallEventDetails(
        txn as any,
        eventId,
        debitAmount,
      );

      expect(txn.valuesMock).toHaveBeenCalledWith({
        id: eventId,
        debitAmount: debitAmount,
      });
    });

    it("should insert event details with zero debit amount", async () => {
      const txn = createMockTransaction();
      txn.insertMock.mockReturnValue({
        values: txn.valuesMock,
      });
      txn.valuesMock.mockResolvedValue(undefined);

      const eventId = "event-uuid-000";
      const debitAmount = 0;

      await EventRepository.insertServerlessFunctionCallEventDetails(
        txn as any,
        eventId,
        debitAmount,
      );

      expect(txn.valuesMock).toHaveBeenCalledWith({
        id: eventId,
        debitAmount: 0,
      });
    });

    it("should insert event details with large debit amount", async () => {
      const txn = createMockTransaction();
      txn.insertMock.mockReturnValue({
        values: txn.valuesMock,
      });
      txn.valuesMock.mockResolvedValue(undefined);

      const eventId = "event-uuid-big";
      const debitAmount = 999999999.99;

      await EventRepository.insertServerlessFunctionCallEventDetails(
        txn as any,
        eventId,
        debitAmount,
      );

      expect(txn.valuesMock).toHaveBeenCalledWith({
        id: eventId,
        debitAmount: 999999999.99,
      });
    });

    it("should properly handle errors from drizzle", async () => {
      const txn = createMockTransaction();
      const randomError = new Error("Insert failed");

      txn.insertMock.mockReturnValue({
        values: txn.valuesMock,
      });
      txn.valuesMock.mockRejectedValue(randomError);

      try {
        await EventRepository.insertServerlessFunctionCallEventDetails(
          txn as any,
          "event-id",
          100,
        );
        expect.fail("Should have thrown PostgresStorageError");
      } catch (error) {
        expect((error as any).name).toBe("PostgresStorageError");
      }
    });

    it("should handle multiple event detail insertions", async () => {
      const txn = createMockTransaction();
      txn.insertMock.mockReturnValue({
        values: txn.valuesMock,
      });
      txn.valuesMock.mockResolvedValue(undefined);

      const eventIds = ["event-1", "event-2", "event-3"];
      const debitAmounts = [100, 200.5, 300.75];

      for (let i = 0; i < eventIds.length; i++) {
        await EventRepository.insertServerlessFunctionCallEventDetails(
          txn as any,
          eventIds[i],
          debitAmounts[i],
        );
      }

      expect(txn.valuesMock).toHaveBeenCalledTimes(3);
      expect(txn.valuesMock).toHaveBeenNthCalledWith(1, {
        id: "event-1",
        debitAmount: 100,
      });
      expect(txn.valuesMock).toHaveBeenNthCalledWith(2, {
        id: "event-2",
        debitAmount: 200.5,
      });
      expect(txn.valuesMock).toHaveBeenNthCalledWith(3, {
        id: "event-3",
        debitAmount: 300.75,
      });
    });
  });

  describe("error handling across all methods", () => {
    it("should properly skip duplicate key errors in insertOrSkipUser", async () => {
      const txn = createMockTransaction();
      const pgError = new Error(
        'duplicate key value violates unique constraint "users_pkey"',
      );

      txn.insertMock.mockReturnValue({
        values: txn.valuesMock,
      });
      txn.valuesMock.mockRejectedValue(pgError);

      // Should skip, not throw
      await expect(
        EventRepository.insertOrSkipUser(txn as any, "user-123"),
      ).resolves.toBeUndefined();
    });
  });
});
