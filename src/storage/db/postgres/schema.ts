import { relations, sql } from "drizzle-orm";
import {
  integer,
  pgTable,
  uuid,
  timestamp,
  text,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { USER_ID_CONFIG } from "../../../config/identifiers";
import { DateTime } from "luxon";

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
  events: many(eventsTable),
  sessions: many(sessionsTable),
}));

export const sessionsTable = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: text("session_id").notNull().unique(),
    processed: boolean("processed").default(false),
    userId: USER_ID_CONFIG.dbType("user_id").references(() => usersTable.id),
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
  events: many(eventsTable),
}));

export const eventsTable = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  reported_timestamp: timestamp("reported_timestamp", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
  ingested_timestamp: timestamp("ingested_timestamp", {
    withTimezone: true,
    mode: "string",
  })
    .defaultNow()
    .notNull(),
  userId: USER_ID_CONFIG.dbType("user_id")
    .references(() => usersTable.id)
    .notNull(),
  api_keyId: uuid("api_key_id").references(() => apiKeysTable.id),
  mode: text("mode", { enum: ["test", "production"] }).notNull(),
});

export const eventsRelation = relations(eventsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [eventsTable.userId],
    references: [usersTable.id],
  }),
  apiKey: one(apiKeysTable, {
    fields: [eventsTable.api_keyId],
    references: [apiKeysTable.id],
  }),
  sdkCallEvent: one(sdkCallEventsTable, {
    fields: [eventsTable.id],
    references: [sdkCallEventsTable.id],
  }),
  paymentEvent: one(paymentEventsTable, {
    fields: [eventsTable.id],
    references: [paymentEventsTable.id],
  }),
  aiTokenUsageEvent: one(aiTokenUsageEventsTable, {
    fields: [eventsTable.id],
    references: [aiTokenUsageEventsTable.id],
  }),
}));

export const sdkCallEventsTable = pgTable("sdk_call_events", {
  id: uuid("id")
    .references(() => eventsTable.id)
    .primaryKey(),
  type: text("type", { enum: ["RAW", "MIDDLEWARE_CALL"] }).notNull(),
  debitAmount: integer("debit_amount").notNull(),
});

export const sdkCallEventsRelation = relations(
  sdkCallEventsTable,
  ({ one }) => ({
    event: one(eventsTable, {
      fields: [sdkCallEventsTable.id],
      references: [eventsTable.id],
    }),
  })
);

export const paymentEventsTable = pgTable("payment_events", {
  id: uuid("id")
    .references(() => eventsTable.id)
    .primaryKey(),
  creditAmount: integer("credit_amount").notNull(),
});

export const paymentEventsRelation = relations(
  paymentEventsTable,
  ({ one }) => ({
    event: one(eventsTable, {
      fields: [paymentEventsTable.id],
      references: [eventsTable.id],
    }),
  })
);

export const tagsTable = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull(),
  amount: integer("amount").notNull(),
});

export const aiTokenUsageEventsTable = pgTable("ai_token_usage_events", {
  id: uuid("id")
    .references(() => eventsTable.id)
    .primaryKey(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  inputDebitAmount: integer("input_debit_amount").notNull(),
  outputDebitAmount: integer("output_debit_amount").notNull(),
});

export const aiTokenUsageEventsRelation = relations(
  aiTokenUsageEventsTable,
  ({ one }) => ({
    event: one(eventsTable, {
      fields: [aiTokenUsageEventsTable.id],
      references: [eventsTable.id],
    }),
  })
);

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
