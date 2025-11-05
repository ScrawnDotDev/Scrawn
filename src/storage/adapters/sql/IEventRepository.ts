/**
 * Generic Event Repository Interface
 * Defines the contract for event persistence operations
 */
export interface IEventRepository {
  /**
   * Insert a new user or skip if already exists
   */
  insertOrSkipUser(txn: any, userId: string): Promise<void>;

  /**
   * Insert an event and return the generated ID
   */
  insertEvent(
    txn: any,
    reportedTimestamp: string,
    userId: string,
  ): Promise<string>;

  /**
   * Insert serverless function call event-specific details
   */
  insertServerlessFunctionCallEventDetails(
    txn: any,
    eventId: string,
    debitAmount: number,
  ): Promise<void>;
}
