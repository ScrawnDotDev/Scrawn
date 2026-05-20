CREATE TABLE "checkout_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "link" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "is_completed" boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX "unique_active_checkout_per_user" ON "checkout_sessions" ("user_id") WHERE "is_completed" = false;
