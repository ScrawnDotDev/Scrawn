import { drizzle } from "drizzle-orm/libsql/node";
import * as schema from "./schema";

let db: ReturnType<typeof drizzle>;

export function getSqliteDB(DATABASE_PATH?: string) {
  if (db) return db;

  if (!DATABASE_PATH) {
    throw new Error("DATABASE_PATH is not defined");
  }

  db = drizzle({
    connection: {
      url: DATABASE_PATH,
    },
    schema,
  });

  return db;
}

export const { usersTable, eventsTable, serverlessFunctionCallEventsTable } =
  schema;
