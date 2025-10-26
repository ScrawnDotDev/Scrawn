import type { EventType } from "../event/Event.ts";
import { drizzle as drizzle_pg } from "drizzle-orm/postgres-js";

/**
 * Storage - Consumes events
 */
export interface StorageAdapterType {
  name: string;
  connectionObject: unknown;
  event: EventType;

  add(): Promise<void>;
}

export interface PostgresStorageAdapterType extends StorageAdapterType {
  name: "POSTGRES";
  connectionObject: ReturnType<typeof drizzle_pg>;
}
