import { relations } from "drizzle-orm";
import { decimal, pgTable, uuid, timestamp } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey(),
});

export const usersRelation = relations(usersTable, ({ many }) => ({
  events: many(eventsTable),
}));

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

export const serverlessFunctionCallEventsTable = pgTable(
  "serverless_function_call_events",
  {
    id: uuid("id")
      .references(() => eventsTable.id)
      .primaryKey(),
    debitAmount: decimal("debit_amount", { mode: "number" }).notNull(),
  },
);
