export type NormalizedBasicUsageEvent = {
  eventId: string;
  idempotencyKey: string;
  userId: string;
  apiKeyId: string | null;
  mode: string;
  type: string;
  debitAmount: number;
};

export interface TestDBAdapter {
  findBasicUsageEvent(
    eventId: string
  ): Promise<NormalizedBasicUsageEvent | undefined>;
}
