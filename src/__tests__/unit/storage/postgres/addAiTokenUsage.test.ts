import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleAddAiTokenUsage } from "../../../../storage/adapter/postgres/handlers/addAiTokenUsage";
import * as dbModule from "../../../../storage/db/postgres/db";
import { DateTime } from "luxon";

describe("handleAddAiTokenUsage - Aggregation and Batch Insert", () => {
  let mockTransaction: any;
  let mockDb: any;

  beforeEach(() => {
    mockTransaction = {
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn(),
      onConflictDoNothing: vi.fn().mockReturnThis(),
    };

    mockDb = {
      transaction: vi.fn(async (callback) => {
        return await callback(mockTransaction);
      }),
    };

    vi.spyOn(dbModule, "getPostgresDB").mockReturnValue(mockDb as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("aggregation logic", () => {
    it("aggregates multiple events for same user and model into one row", async () => {
      const events = [
        {
          type: "AI_TOKEN_USAGE" as const,
          userId: "user-1",
          reported_timestamp: DateTime.now(),
          data: {
            model: "gpt-4",
            inputTokens: 100,
            outputTokens: 50,
            inputDebitAmount: 10,
            outputDebitAmount: 5,
          },
        },
        {
          type: "AI_TOKEN_USAGE" as const,
          userId: "user-1",
          reported_timestamp: DateTime.now(),
          data: {
            model: "gpt-4",
            inputTokens: 200,
            outputTokens: 100,
            inputDebitAmount: 20,
            outputDebitAmount: 10,
          },
        },
        {
          type: "AI_TOKEN_USAGE" as const,
          userId: "user-1",
          reported_timestamp: DateTime.now(),
          data: {
            model: "gpt-4",
            inputTokens: 50,
            outputTokens: 25,
            inputDebitAmount: 5,
            outputDebitAmount: 2,
          },
        },
      ];

      mockTransaction.returning.mockResolvedValueOnce([{ id: "event-1" }]);

      await handleAddAiTokenUsage(events, "api-key-123");

      // Should insert only 1 event (aggregated)
      const eventInsertCall = mockTransaction.values.mock.calls[1];
      expect(eventInsertCall[0]).toHaveLength(1);
      expect(eventInsertCall[0][0].userId).toBe("user-1");

      // Should insert only 1 AI token usage record with aggregated values
      const aiTokenUsageInsertCall = mockTransaction.values.mock.calls[2];
      expect(aiTokenUsageInsertCall[0]).toHaveLength(1);
      expect(aiTokenUsageInsertCall[0][0]).toEqual({
        id: "event-1",
        model: "gpt-4",
        inputTokens: 350, // 100 + 200 + 50
        outputTokens: 175, // 50 + 100 + 25
        inputDebitAmount: 35, // 10 + 20 + 5
        outputDebitAmount: 17, // 5 + 10 + 2
      });
    });

    it("creates separate rows for different models of same user", async () => {
      const events = [
        {
          type: "AI_TOKEN_USAGE" as const,
          userId: "user-1",
          reported_timestamp: DateTime.now(),
          data: {
            model: "gpt-4",
            inputTokens: 100,
            outputTokens: 50,
            inputDebitAmount: 10,
            outputDebitAmount: 5,
          },
        },
        {
          type: "AI_TOKEN_USAGE" as const,
          userId: "user-1",
          reported_timestamp: DateTime.now(),
          data: {
            model: "claude-3-opus",
            inputTokens: 150,
            outputTokens: 75,
            inputDebitAmount: 15,
            outputDebitAmount: 7,
          },
        },
        {
          type: "AI_TOKEN_USAGE" as const,
          userId: "user-1",
          reported_timestamp: DateTime.now(),
          data: {
            model: "gpt-4",
            inputTokens: 200,
            outputTokens: 100,
            inputDebitAmount: 20,
            outputDebitAmount: 10,
          },
        },
      ];

      mockTransaction.returning.mockResolvedValueOnce([
        { id: "event-1" },
        { id: "event-2" },
      ]);

      await handleAddAiTokenUsage(events, "api-key-123");

      // Should insert 2 events (one per model)
      const eventInsertCall = mockTransaction.values.mock.calls[1];
      expect(eventInsertCall[0]).toHaveLength(2);

      // Should insert 2 AI token usage records
      const aiTokenUsageInsertCall = mockTransaction.values.mock.calls[2];
      expect(aiTokenUsageInsertCall[0]).toHaveLength(2);

      // Find GPT-4 aggregated record
      const gpt4Record = aiTokenUsageInsertCall[0].find(
        (r: any) => r.model === "gpt-4",
      );
      expect(gpt4Record).toEqual({
        id: expect.any(String),
        model: "gpt-4",
        inputTokens: 300, // 100 + 200
        outputTokens: 150, // 50 + 100
        inputDebitAmount: 30, // 10 + 20
        outputDebitAmount: 15, // 5 + 10
      });

      // Find Claude aggregated record
      const claudeRecord = aiTokenUsageInsertCall[0].find(
        (r: any) => r.model === "claude-3-opus",
      );
      expect(claudeRecord).toEqual({
        id: expect.any(String),
        model: "claude-3-opus",
        inputTokens: 150,
        outputTokens: 75,
        inputDebitAmount: 15,
        outputDebitAmount: 7,
      });
    });

    it("creates separate rows for different users with same model", async () => {
      const events = [
        {
          type: "AI_TOKEN_USAGE" as const,
          userId: "user-1",
          reported_timestamp: DateTime.now(),
          data: {
            model: "gpt-4",
            inputTokens: 100,
            outputTokens: 50,
            inputDebitAmount: 10,
            outputDebitAmount: 5,
          },
        },
        {
          type: "AI_TOKEN_USAGE" as const,
          userId: "user-2",
          reported_timestamp: DateTime.now(),
          data: {
            model: "gpt-4",
            inputTokens: 200,
            outputTokens: 100,
            inputDebitAmount: 20,
            outputDebitAmount: 10,
          },
        },
        {
          type: "AI_TOKEN_USAGE" as const,
          userId: "user-1",
          reported_timestamp: DateTime.now(),
          data: {
            model: "gpt-4",
            inputTokens: 50,
            outputTokens: 25,
            inputDebitAmount: 5,
            outputDebitAmount: 2,
          },
        },
      ];

      mockTransaction.returning.mockResolvedValueOnce([
        { id: "event-1" },
        { id: "event-2" },
      ]);

      await handleAddAiTokenUsage(events, "api-key-123");

      // Should insert 2 events (one per user)
      const eventInsertCall = mockTransaction.values.mock.calls[1];
      expect(eventInsertCall[0]).toHaveLength(2);

      // Should insert 2 AI token usage records
      const aiTokenUsageInsertCall = mockTransaction.values.mock.calls[2];
      expect(aiTokenUsageInsertCall[0]).toHaveLength(2);
    });

    it("handles complex scenario with multiple users and models", async () => {
      const events = [
        {
          type: "AI_TOKEN_USAGE" as const,
          userId: "user-1",
          reported_timestamp: DateTime.now(),
          data: {
            model: "gpt-4",
            inputTokens: 100,
            outputTokens: 50,
            inputDebitAmount: 10,
            outputDebitAmount: 5,
          },
        },
        {
          type: "AI_TOKEN_USAGE" as const,
          userId: "user-1",
          reported_timestamp: DateTime.now(),
          data: {
            model: "gpt-4",
            inputTokens: 200,
            outputTokens: 100,
            inputDebitAmount: 20,
            outputDebitAmount: 10,
          },
        },
        {
          type: "AI_TOKEN_USAGE" as const,
          userId: "user-1",
          reported_timestamp: DateTime.now(),
          data: {
            model: "claude-3-sonnet",
            inputTokens: 150,
            outputTokens: 75,
            inputDebitAmount: 15,
            outputDebitAmount: 7,
          },
        },
        {
          type: "AI_TOKEN_USAGE" as const,
          userId: "user-2",
          reported_timestamp: DateTime.now(),
          data: {
            model: "gpt-4",
            inputTokens: 300,
            outputTokens: 150,
            inputDebitAmount: 30,
            outputDebitAmount: 15,
          },
        },
        {
          type: "AI_TOKEN_USAGE" as const,
          userId: "user-2",
          reported_timestamp: DateTime.now(),
          data: {
            model: "gpt-4",
            inputTokens: 100,
            outputTokens: 50,
            inputDebitAmount: 10,
            outputDebitAmount: 5,
          },
        },
      ];

      mockTransaction.returning.mockResolvedValueOnce([
        { id: "event-1" },
        { id: "event-2" },
        { id: "event-3" },
      ]);

      await handleAddAiTokenUsage(events, "api-key-123");

      // Should insert 3 aggregated events:
      // 1. user-1 + gpt-4
      // 2. user-1 + claude-3-sonnet
      // 3. user-2 + gpt-4
      const eventInsertCall = mockTransaction.values.mock.calls[1];
      expect(eventInsertCall[0]).toHaveLength(3);

      const aiTokenUsageInsertCall = mockTransaction.values.mock.calls[2];
      expect(aiTokenUsageInsertCall[0]).toHaveLength(3);

      // Verify aggregation: should have 2 gpt-4 records and 1 claude record
      const gpt4Records = aiTokenUsageInsertCall[0].filter(
        (r: any) => r.model === "gpt-4",
      );
      expect(gpt4Records).toHaveLength(2);

      const claudeRecords = aiTokenUsageInsertCall[0].filter(
        (r: any) => r.model === "claude-3-sonnet",
      );
      expect(claudeRecords).toHaveLength(1);

      // Verify the gpt-4 records have correct aggregated values
      const gpt4Tokens = gpt4Records.map((r: any) => r.inputTokens).sort();
      expect(gpt4Tokens).toEqual([300, 400]); // user-1: 100+200=300, user-2: 300+100=400
    });
  });

  describe("single event handling", () => {
    it("handles single event without aggregation", async () => {
      const events = [
        {
          type: "AI_TOKEN_USAGE" as const,
          userId: "user-1",
          reported_timestamp: DateTime.now(),
          data: {
            model: "gpt-4",
            inputTokens: 100,
            outputTokens: 50,
            inputDebitAmount: 10,
            outputDebitAmount: 5,
          },
        },
      ];

      mockTransaction.returning.mockResolvedValueOnce([{ id: "event-1" }]);

      await handleAddAiTokenUsage(events, "api-key-123");

      const aiTokenUsageInsertCall = mockTransaction.values.mock.calls[2];
      expect(aiTokenUsageInsertCall[0]).toHaveLength(1);
      expect(aiTokenUsageInsertCall[0][0]).toEqual({
        id: "event-1",
        model: "gpt-4",
        inputTokens: 100,
        outputTokens: 50,
        inputDebitAmount: 10,
        outputDebitAmount: 5,
      });
    });
  });

  describe("user insertion", () => {
    it("batch inserts all unique users", async () => {
      const events = [
        {
          type: "AI_TOKEN_USAGE" as const,
          userId: "user-1",
          reported_timestamp: DateTime.now(),
          data: {
            model: "gpt-4",
            inputTokens: 100,
            outputTokens: 50,
            inputDebitAmount: 10,
            outputDebitAmount: 5,
          },
        },
        {
          type: "AI_TOKEN_USAGE" as const,
          userId: "user-2",
          reported_timestamp: DateTime.now(),
          data: {
            model: "gpt-4",
            inputTokens: 200,
            outputTokens: 100,
            inputDebitAmount: 20,
            outputDebitAmount: 10,
          },
        },
        {
          type: "AI_TOKEN_USAGE" as const,
          userId: "user-3",
          reported_timestamp: DateTime.now(),
          data: {
            model: "claude-3-opus",
            inputTokens: 150,
            outputTokens: 75,
            inputDebitAmount: 15,
            outputDebitAmount: 7,
          },
        },
      ];

      mockTransaction.returning.mockResolvedValueOnce([
        { id: "event-1" },
        { id: "event-2" },
        { id: "event-3" },
      ]);

      await handleAddAiTokenUsage(events, "api-key-123");

      // Check users insert
      const usersInsertCall = mockTransaction.values.mock.calls[0];
      expect(usersInsertCall[0]).toHaveLength(3);
      expect(usersInsertCall[0]).toEqual(
        expect.arrayContaining([
          { id: "user-1" },
          { id: "user-2" },
          { id: "user-3" },
        ]),
      );
    });

    it("inserts duplicate users only once", async () => {
      const events = [
        {
          type: "AI_TOKEN_USAGE" as const,
          userId: "user-1",
          reported_timestamp: DateTime.now(),
          data: {
            model: "gpt-4",
            inputTokens: 100,
            outputTokens: 50,
            inputDebitAmount: 10,
            outputDebitAmount: 5,
          },
        },
        {
          type: "AI_TOKEN_USAGE" as const,
          userId: "user-1",
          reported_timestamp: DateTime.now(),
          data: {
            model: "claude-3-opus",
            inputTokens: 200,
            outputTokens: 100,
            inputDebitAmount: 20,
            outputDebitAmount: 10,
          },
        },
      ];

      mockTransaction.returning.mockResolvedValueOnce([
        { id: "event-1" },
        { id: "event-2" },
      ]);

      await handleAddAiTokenUsage(events, "api-key-123");

      // Should only insert user-1 once
      const usersInsertCall = mockTransaction.values.mock.calls[0];
      expect(usersInsertCall[0]).toHaveLength(1);
      expect(usersInsertCall[0][0]).toEqual({ id: "user-1" });
    });
  });

  describe("edge cases", () => {
    it("handles empty array", async () => {
      const result = await handleAddAiTokenUsage([], "api-key-123");
      expect(result).toBeUndefined();
      expect(mockTransaction.insert).not.toHaveBeenCalled();
    });

    it("handles event insert returning no IDs", async () => {
      const events = [
        {
          type: "AI_TOKEN_USAGE" as const,
          userId: "user-1",
          reported_timestamp: DateTime.now(),
          data: {
            model: "gpt-4",
            inputTokens: 100,
            outputTokens: 50,
            inputDebitAmount: 10,
            outputDebitAmount: 5,
          },
        },
      ];

      mockTransaction.returning.mockResolvedValueOnce([]);

      await expect(
        handleAddAiTokenUsage(events, "api-key-123"),
      ).rejects.toThrow("Event insert returned no IDs");
    });

    it("handles event ID count mismatch", async () => {
      const events = [
        {
          type: "AI_TOKEN_USAGE" as const,
          userId: "user-1",
          reported_timestamp: DateTime.now(),
          data: {
            model: "gpt-4",
            inputTokens: 100,
            outputTokens: 50,
            inputDebitAmount: 10,
            outputDebitAmount: 5,
          },
        },
        {
          type: "AI_TOKEN_USAGE" as const,
          userId: "user-2",
          reported_timestamp: DateTime.now(),
          data: {
            model: "gpt-4",
            inputTokens: 200,
            outputTokens: 100,
            inputDebitAmount: 20,
            outputDebitAmount: 10,
          },
        },
      ];

      // Return only 1 ID when expecting 2
      mockTransaction.returning.mockResolvedValueOnce([{ id: "event-1" }]);

      await expect(
        handleAddAiTokenUsage(events, "api-key-123"),
      ).rejects.toThrow("Expected 2 event IDs but got 1");
    });
  });

  describe("database errors", () => {
    it("handles transaction failure", async () => {
      const events = [
        {
          type: "AI_TOKEN_USAGE" as const,
          userId: "user-1",
          reported_timestamp: DateTime.now(),
          data: {
            model: "gpt-4",
            inputTokens: 100,
            outputTokens: 50,
            inputDebitAmount: 10,
            outputDebitAmount: 5,
          },
        },
      ];

      mockDb.transaction.mockRejectedValueOnce(new Error("Transaction failed"));

      await expect(
        handleAddAiTokenUsage(events, "api-key-123"),
      ).rejects.toThrow("Transaction failed");
    });

    it("handles event insert failure", async () => {
      const events = [
        {
          type: "AI_TOKEN_USAGE" as const,
          userId: "user-1",
          reported_timestamp: DateTime.now(),
          data: {
            model: "gpt-4",
            inputTokens: 100,
            outputTokens: 50,
            inputDebitAmount: 10,
            outputDebitAmount: 5,
          },
        },
      ];

      mockTransaction.returning.mockRejectedValueOnce(
        new Error("Insert failed"),
      );

      await expect(
        handleAddAiTokenUsage(events, "api-key-123"),
      ).rejects.toThrow();
    });
  });
});
