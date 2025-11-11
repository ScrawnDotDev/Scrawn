import { relations } from "drizzle-orm";
import {
  integer,
  pgTable,
  uuid,
  timestamp,
  text,
  boolean,
} from "drizzle-orm/pg-core";
import { USER_ID_CONFIG } from "../../../config/identifiers";

export const usersTable = pgTable("users", {
  id: USER_ID_CONFIG.dbType("id").primaryKey(),
});

export const usersRelation = relations(usersTable, ({ many }) => ({
  events: many(eventsTable),
}));

export const apiKeysTable = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  key: text("key").notNull().unique(),
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
});

export const apiKeysRelation = relations(apiKeysTable, ({ many }) => ({
  events: many(eventsTable),
}));

export const eventsTable = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  reported_timestamp: timestamp("reported_timestamp", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
  userId: USER_ID_CONFIG.dbType("user_id")
    .references(() => usersTable.id)
    .notNull(),
  api_keyId: uuid("api_key_id").references(() => apiKeysTable.id),
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
  }),
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
  }),
);
