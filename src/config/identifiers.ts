import { z } from "zod";
import { uuid, bigint, integer } from "drizzle-orm/pg-core";

/**
 * Configuration for identifier types used throughout the application.
 *
 * ⚠️ IMPORTANT: Choose your ID type BEFORE running migrations.
 * Changing this after migration requires clearing the database.
 *
 * Available options:
 * - uuid: String-based UUIDs (e.g., "550e8400-e29b-41d4-a716-446655440000")
 * - bigint: Large integers (e.g., 9007199254740991n)
 * - int: Regular integers (e.g., 123456)
 */

const ID_CONFIGS = {
  uuid: {
    dbType: uuid,
    validator: z.string().uuid({ message: "Invalid UUID" }),
  },
  bigint: {
    dbType: bigint,
    validator: z.bigint(),
  },
  int: {
    dbType: integer,
    validator: z.number().int(),
  },
} as const;

/**
 * USER ID CONFIGURATION
 * Change the ID_CONFIGS key here to switch user ID type.
 * Options: 'uuid' | 'bigint' | 'int'
 */
export const USER_ID_CONFIG = ID_CONFIGS.uuid;

export type UserId = z.infer<typeof USER_ID_CONFIG.validator>;

export const STORAGE_ADAPTERS = {
  postgres: "postgres",
  clickhouse: "clickhouse",
} as const;

export type StorageAdapterType =
  (typeof STORAGE_ADAPTERS)[keyof typeof STORAGE_ADAPTERS];

/**
 * STORAGE ADAPTER CONFIGURATION
 * Driven by the STORAGE_ADAPTER environment variable.
 * Options: 'postgres' | 'clickhouse'
 * Defaults to 'postgres' if not set.
 */
const rawAdapter = process.env.STORAGE_ADAPTER ?? "postgres";
export const STORAGE_ADAPTER: StorageAdapterType =
  rawAdapter === "clickhouse"
    ? STORAGE_ADAPTERS.clickhouse
    : STORAGE_ADAPTERS.postgres;
