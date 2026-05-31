export type NormalizedBasicUsageEvent = {
  eventId: string;
  idempotencyKey: string;
  userId: string;
  apiKeyId: string | null;
  mode: string;
  type: string;
  debitAmount: number;
};

export type NormalizedAPIKey = {
  id: string;
  name: string;
  role: string;
  revoked: boolean;
};

export interface TestDBAdapter {
  findBasicUsageEvent(
    eventId: string
  ): Promise<NormalizedBasicUsageEvent | undefined>;
  findAPIKey(apiKeyId: string): Promise<NormalizedAPIKey | undefined>;
}
