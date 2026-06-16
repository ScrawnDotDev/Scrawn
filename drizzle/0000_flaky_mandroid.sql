CREATE TABLE "ai_token_usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"reported_timestamp" timestamp with time zone NOT NULL,
	"ingested_timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"api_key_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"model" text NOT NULL,
	"provider" text NOT NULL,
	"metrics" jsonb NOT NULL,
	"metadata" jsonb,
	CONSTRAINT "ai_token_usage_events_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"role" text DEFAULT 'dashboard' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"project_id" uuid NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_keys_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "basic_usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"reported_timestamp" timestamp with time zone NOT NULL,
	"ingested_timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"api_key_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"type" text NOT NULL,
	"debit_amount" bigint NOT NULL,
	"metadata" jsonb,
	CONSTRAINT "basic_usage_events_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "expressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"expr" text NOT NULL,
	"project_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"last_run_at" timestamp with time zone,
	"dodo_live_api_key" text NOT NULL,
	"dodo_test_api_key" text NOT NULL,
	"dodo_live_product_id" text NOT NULL,
	"dodo_test_product_id" text NOT NULL,
	"dodo_live_webhook_secret" text NOT NULL,
	"dodo_test_webhook_secret" text NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"project_id" uuid NOT NULL,
	"redirect_url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reported_timestamp" timestamp with time zone NOT NULL,
	"ingested_timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"api_key_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"credit_amount" bigint NOT NULL,
	"proxy_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"project_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"proxy_link_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"processed" text DEFAULT 'pending' NOT NULL,
	"user_id" uuid NOT NULL,
	"api_key_id" uuid NOT NULL,
	"billed_upto" timestamp with time zone NOT NULL,
	"checkout_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"project_id" uuid NOT NULL,
	"mode" text DEFAULT 'production' NOT NULL,
	CONSTRAINT "sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"amount" integer NOT NULL,
	"deleted_at" timestamp with time zone,
	"project_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid NOT NULL,
	"last_billed_timestamp" timestamp with time zone DEFAULT '0001-01-01T00:00:00.000Z' NOT NULL,
	"payment_provider_user_id" text,
	"project_id" uuid NOT NULL,
	"mode" text DEFAULT 'production' NOT NULL,
	CONSTRAINT "users_id_project_id_pk" PRIMARY KEY("id","project_id")
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"resource" text NOT NULL,
	"action" text NOT NULL,
	"status" text NOT NULL,
	"request_body" jsonb,
	"response_status" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"project_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_key_id" uuid NOT NULL,
	"url" text NOT NULL,
	"private_key" text NOT NULL,
	"public_key" text NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ai_token_usage_events" ADD CONSTRAINT "ai_token_usage_events_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_token_usage_events" ADD CONSTRAINT "ai_token_usage_events_project_id_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_token_usage_events" ADD CONSTRAINT "ai_token_usage_events_user_id_project_id_users_id_project_id_fk" FOREIGN KEY ("user_id","project_id") REFERENCES "public"."users"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_id_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basic_usage_events" ADD CONSTRAINT "basic_usage_events_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basic_usage_events" ADD CONSTRAINT "basic_usage_events_project_id_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basic_usage_events" ADD CONSTRAINT "basic_usage_events_user_id_project_id_users_id_project_id_fk" FOREIGN KEY ("user_id","project_id") REFERENCES "public"."users"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expressions" ADD CONSTRAINT "expressions_project_id_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata" ADD CONSTRAINT "metadata_project_id_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_project_id_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_proxy_id_sessions_proxy_link_id_fk" FOREIGN KEY ("proxy_id") REFERENCES "public"."sessions"("proxy_link_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_user_id_project_id_users_id_project_id_fk" FOREIGN KEY ("user_id","project_id") REFERENCES "public"."users"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_project_id_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_project_id_users_id_project_id_fk" FOREIGN KEY ("user_id","project_id") REFERENCES "public"."users"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_project_id_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_project_id_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_project_id_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_project_id_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_active_name" ON "api_keys" USING btree ("name") WHERE "api_keys"."revoked" = false;--> statement-breakpoint
CREATE UNIQUE INDEX "metadata_project_id_unique" ON "metadata" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_session_id" ON "sessions" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_webhook_api_key" ON "webhook_endpoints" USING btree ("api_key_id");