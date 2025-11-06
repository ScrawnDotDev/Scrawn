import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "./schema";

let db: ReturnType<typeof drizzle>;

export async function getMysqlDB(DATABASE_URL?: string) {
  if (db) return db;

  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined");
  }

  db = drizzle(process.env.DATABASE_URL!, { schema, mode: "default" });
  return db;
}

export const usersTable = schema.usersTable;
export const eventsTable = schema.eventsTable;
export const serverlessFunctionCallEventsTable =
  schema.serverlessFunctionCallEventsTable;
