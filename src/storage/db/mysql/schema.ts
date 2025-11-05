import { relations } from "drizzle-orm";
import {
  mysqlTable,
  varchar,
  decimal,
  timestamp,
} from "drizzle-orm/mysql-core";

export const usersTable = mysqlTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
});

export const usersRelation = relations(usersTable, ({ many }) => ({
  events: many(eventsTable),
}));

export const eventsTable = mysqlTable("events", {
  id: varchar("id", { length: 36 }).primaryKey(),
  reported_timestamp: timestamp("reported_timestamp", {
    mode: "string",
  }).notNull(),
  userId: varchar("user_id", { length: 36 })
    .references(() => usersTable.id)
    .notNull(),
});

export const eventsRelation = relations(eventsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [eventsTable.userId],
    references: [usersTable.id],
  }),
}));

export const serverlessFunctionCallEventsTable = mysqlTable(
  "serverless_function_call_events",
  {
    id: varchar("id", { length: 36 })
      .references(() => eventsTable.id)
      .primaryKey(),
    debitAmount: decimal("debit_amount", {
      precision: 19,
      scale: 4,
      mode: "string",
    }).notNull(),
  },
);
