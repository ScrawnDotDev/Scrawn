import { relations } from "drizzle-orm";
import {
  decimal,
  pgTable,
  uuid,
  timestamp,
  text,
  boolean,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey(),
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

export const eventsTable = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  reported_timestamp: timestamp("reported_timestamp", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
  userId: uuid("user_id")
    .references(() => usersTable.id)
    .notNull(),
});

export const eventsRelation = relations(eventsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [eventsTable.userId],
    references: [usersTable.id],
  }),
}));

export const sdkCallEventsTable = pgTable("sdk_call_events", {
  id: uuid("id")
    .references(() => eventsTable.id)
    .primaryKey(),
  type: text("type", { enum: ["RAW", "MIDDLEWARE_CALL"] }).notNull(),
  debitAmount: decimal("debit_amount", { mode: "number" }).notNull(),
});
