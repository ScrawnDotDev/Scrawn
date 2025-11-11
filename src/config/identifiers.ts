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

/**
 * Type-safe UserId type inferred from configuration.
 * This type is used throughout the codebase for user identifiers.
 */
export type UserId = z.infer<typeof USER_ID_CONFIG.validator>;

/**
 * Parse and validate a user ID from external input (e.g., gRPC string).
 * Throws if validation fails.
 */
export function parseUserId(input: unknown): UserId {
  return USER_ID_CONFIG.validator.parse(input);
}

/**
 * Safely parse a user ID, returning undefined if validation fails.
 * Use this when you want to handle validation errors gracefully.
 */
export function safeParseUserId(input: unknown): UserId | undefined {
  const result = USER_ID_CONFIG.validator.safeParse(input);
  return result.success ? result.data : undefined;
}
