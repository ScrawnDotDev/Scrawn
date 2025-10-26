import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./db/schema";

let db: ReturnType<typeof drizzle>;

export function getPostgresDB(DATABASE_URL?: string) {
  if (db) return db;

  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined");
  }

  const client = postgres(DATABASE_URL);
  db = drizzle({ client, schema });

  return db;
}
