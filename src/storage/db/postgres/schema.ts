import { relations, sql } from "drizzle-orm";
import {
  integer,
  bigint,
  pgTable,
  uuid,
  timestamp,
  text,
  boolean,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { USER_ID_CONFIG } from "../../../config/identifiers";
import { DateTime } from "luxon";
import { type Metrics } from "../../../zod/metrics";

export const usersTable = pgTable("users", {
  id: USER_ID_CONFIG.dbType("id").primaryKey(),
  last_billed_timestamp: timestamp("last_billed_timestamp", {
    withTimezone: true,
    mode: "string",
  })
    .default(DateTime.utc(1).toString())
    .notNull(),
  payment_provider_user_id: text("payment_provider_user_id"),
  mode: text("mode", { enum: ["test", "production"] })
    .notNull()
    .default("production"),
});

export const usersRelation = relations(usersTable, ({ many }) => ({
  sessions: many(sessionsTable),
  basicUsageEvents: many(basicUsageEventsTable),
  paymentEvents: many(paymentEventsTable),
  aiTokenUsageEvents: many(aiTokenUsageEventsTable),
}));

export const sessionsTable = pgTable(
  "sessions",
  {
    proxy_link_id: uuid("proxy_link_id").primaryKey().defaultRandom(),
    sessionId: text("session_id").notNull().unique(),
    processed: text("processed", { enum: ["pending", "failed", "succeeded"] })
      .default("pending")
      .notNull(),
    userId: USER_ID_CONFIG.dbType("user_id")
      .references(() => usersTable.id)
      .notNull(),
    apiKeyId: uuid("api_key_id")
      .references(() => apiKeysTable.id)
      .notNull(),
    billed_upto: timestamp("billed_upto", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    checkoutUrl: text("checkout_url").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    })
      .defaultNow()
      .notNull(),
    mode: text("mode", { enum: ["test", "production"] })
      .notNull()
      .default("production"),
  },
  (table) => ({
    uniqueSessionId: uniqueIndex("unique_session_id").on(table.sessionId),
  })
);

export const sessionRelations = relations(sessionsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [sessionsTable.userId],
    references: [usersTable.id],
  }),
  apiKey: one(apiKeysTable, {
    fields: [sessionsTable.apiKeyId],
    references: [apiKeysTable.id],
  }),
}));

export const apiKeysTable = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    key: text("key").notNull().unique(),
    role: text("role", { enum: ["dashboard", "production", "test"] })
      .notNull()
      .default("dashboard"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    revoked: boolean("revoked").default(false).notNull(),
    revokedAt: timestamp("revoked_at", {
      withTimezone: true,
      mode: "string",
    }),
  },
  (table) => ({
    uniqueActiveName: uniqueIndex("unique_active_name")
      .on(table.name)
      .where(sql`${table.revoked} = false`),
  })
);

export const apiKeysRelation = relations(apiKeysTable, ({ many }) => ({
  sessions: many(sessionsTable),
  basicUsageEvents: many(basicUsageEventsTable),
  paymentEvents: many(paymentEventsTable),
  aiTokenUsageEvents: many(aiTokenUsageEventsTable),
}));

export const basicUsageEventsTable = pgTable("basic_usage_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  reportedTimestamp: timestamp("reported_timestamp", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
  ingestedTimestamp: timestamp("ingested_timestamp", {
    withTimezone: true,
    mode: "string",
  })
    .defaultNow()
    .notNull(),
  userId: USER_ID_CONFIG.dbType("user_id")
    .references(() => usersTable.id)
    .notNull(),
  apiKeyId: uuid("api_key_id")
    .references(() => apiKeysTable.id)
    .notNull(),
  mode: text("mode", { enum: ["test", "production"] }).notNull(),
  type: text("type", { enum: ["RAW", "MIDDLEWARE_CALL"] }).notNull(),
  debitAmount: bigint("debit_amount", { mode: "number" }).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
});

export const basicUsageEventsRelation = relations(
  basicUsageEventsTable,
  ({ one }) => ({
    user: one(usersTable, {
      fields: [basicUsageEventsTable.userId],
      references: [usersTable.id],
    }),
    apiKey: one(apiKeysTable, {
      fields: [basicUsageEventsTable.apiKeyId],
      references: [apiKeysTable.id],
    }),
  })
);

export const paymentEventsTable = pgTable("payment_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportedTimestamp: timestamp("reported_timestamp", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
  ingestedTimestamp: timestamp("ingested_timestamp", {
    withTimezone: true,
    mode: "string",
  })
    .defaultNow()
    .notNull(),
  userId: USER_ID_CONFIG.dbType("user_id")
    .references(() => usersTable.id)
    .notNull(),
  apiKeyId: uuid("api_key_id")
    .references(() => apiKeysTable.id)
    .notNull(),
  mode: text("mode", { enum: ["test", "production"] }).notNull(),
  creditAmount: bigint("credit_amount", { mode: "number" }).notNull(),
});

export const paymentEventsRelation = relations(
  paymentEventsTable,
  ({ one }) => ({
    user: one(usersTable, {
      fields: [paymentEventsTable.userId],
      references: [usersTable.id],
    }),
    apiKey: one(apiKeysTable, {
      fields: [paymentEventsTable.apiKeyId],
      references: [apiKeysTable.id],
    }),
  })
);

export const aiTokenUsageEventsTable = pgTable("ai_token_usage_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  reportedTimestamp: timestamp("reported_timestamp", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
  ingestedTimestamp: timestamp("ingested_timestamp", {
    withTimezone: true,
    mode: "string",
  })
    .defaultNow()
    .notNull(),
  userId: USER_ID_CONFIG.dbType("user_id")
    .references(() => usersTable.id)
    .notNull(),
  apiKeyId: uuid("api_key_id")
    .references(() => apiKeysTable.id)
    .notNull(),
  mode: text("mode", { enum: ["test", "production"] }).notNull(),
  model: text("model").notNull(),
  provider: text("provider").notNull(),
  metrics: jsonb("metrics").$type<Metrics>().notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
});

export const aiTokenUsageEventsRelation = relations(
  aiTokenUsageEventsTable,
  ({ one }) => ({
    user: one(usersTable, {
      fields: [aiTokenUsageEventsTable.userId],
      references: [usersTable.id],
    }),
    apiKey: one(apiKeysTable, {
      fields: [aiTokenUsageEventsTable.apiKeyId],
      references: [apiKeysTable.id],
    }),
  })
);

export const tagsTable = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull(),
  amount: integer("amount").notNull(),
});

export const metadataTable = pgTable("metadata", {
  id: uuid("id").primaryKey().defaultRandom(),
  payment_cron: jsonb("payment_cron").$type<string[]>().notNull(),
  payment_webhook: text("payment_webhook"),
  last_run_at: timestamp("last_run_at", {
    withTimezone: true,
    mode: "string",
  }),
  dodo_live_api_key: text("dodo_live_api_key"),
  dodo_test_api_key: text("dodo_test_api_key"),
  dodo_product_id: text("dodo_product_id").notNull().default(""),
  dodo_webhook_secret: text("dodo_webhook_secret"),
  currency: text("currency").notNull().default("usd"),
  redirect_url: text("redirect_url"),
});

export const expressionsTable = pgTable("expressions", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  expr: text("expr").notNull(),
});

export const webhookEndpointsTable = pgTable(
  "webhook_endpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    apiKeyId: uuid("api_key_id")
      .references(() => apiKeysTable.id)
      .notNull(),
    url: text("url").notNull(),
    privateKey: text("private_key").notNull(),
    publicKey: text("public_key").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "string",
    })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", {
      withTimezone: true,
      mode: "string",
    }),
  },
  (table) => ({
    uniqueApiKey: uniqueIndex("unique_webhook_api_key").on(table.apiKeyId),
  })
);

export const webhookEndpointsRelation = relations(
  webhookEndpointsTable,
  ({ one }) => ({
    apiKey: one(apiKeysTable, {
      fields: [webhookEndpointsTable.apiKeyId],
      references: [apiKeysTable.id],
    }),
  })
);

export const webhookDeliveriesTable = pgTable("webhook_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  endpointId: uuid("endpoint_id")
    .references(() => webhookEndpointsTable.id)
    .notNull(),
  eventId: text("event_id").notNull(),
  eventType: text("event_type").notNull(),
  resource: text("resource").notNull(),
  action: text("action").notNull(),
  status: text("status", { enum: ["delivered", "failed"] }).notNull(),
  requestBody: jsonb("request_body").$type<Record<string, unknown>>(),
  responseStatus: integer("response_status"),
  error: text("error"),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "string",
  })
    .defaultNow()
    .notNull(),
});

export const webhookDeliveriesRelation = relations(
  webhookDeliveriesTable,
  ({ one }) => ({
    endpoint: one(webhookEndpointsTable, {
      fields: [webhookDeliveriesTable.endpointId],
      references: [webhookEndpointsTable.id],
    }),
  })
);
