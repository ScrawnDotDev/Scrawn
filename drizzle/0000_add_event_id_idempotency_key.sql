ALTER TABLE "basic_usage_events" ADD COLUMN "event_id" uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "basic_usage_events" ADD COLUMN "idempotency_key" text NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "basic_usage_events" ADD CONSTRAINT "basic_usage_events_idempotency_key_unique" UNIQUE ("idempotency_key");

ALTER TABLE "ai_token_usage_events" ADD COLUMN "event_id" uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "ai_token_usage_events" ADD COLUMN "idempotency_key" text NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "ai_token_usage_events" ADD CONSTRAINT "ai_token_usage_events_idempotency_key_unique" UNIQUE ("idempotency_key");
