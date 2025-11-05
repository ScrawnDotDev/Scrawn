import { relations } from "drizzle-orm";
import { sqliteTable, text, real } from "drizzle-orm/sqlite-core";

export const usersTable = sqliteTable("users", {
  id: text("id").primaryKey(),
});

export const usersRelation = relations(usersTable, ({ many }) => ({
  events: many(eventsTable),
}));

export const eventsTable = sqliteTable("events", {
  id: text("id").primaryKey(),
  reported_timestamp: text("reported_timestamp").notNull(),
  userId: text("user_id")
    .references(() => usersTable.id)
    .notNull(),
});

export const eventsRelation = relations(eventsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [eventsTable.userId],
    references: [usersTable.id],
  }),
}));

export const serverlessFunctionCallEventsTable = sqliteTable(
  "serverless_function_call_events",
  {
    id: text("id")
      .references(() => eventsTable.id)
      .primaryKey(),
    debitAmount: real("debit_amount").notNull(),
  },
);
