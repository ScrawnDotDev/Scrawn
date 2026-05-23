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
    proxy_link_id: uuid("id").primaryKey().defaultRandom(),
    sessionId: text("session_id").notNull().unique(),
    processed: boolean("processed").default(false),
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
  payment_cron: text("payment_cron").notNull(),
  payment_webhook: text("payment_webhook"),
});

export const expressionsTable = pgTable("expressions", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  expr: text("expr").notNull(),
});
