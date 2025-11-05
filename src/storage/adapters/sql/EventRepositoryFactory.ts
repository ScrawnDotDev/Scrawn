import type { IEventRepository } from "./IEventRepository";
import { MysqlEventRepository } from "./MysqlEventRepository";
import { PostgresEventRepository } from "./PostgresEventRepository";
import { SqliteEventRepository } from "./SqliteEventRepository";

export type EventRepositoryType = "mysql" | "postgres" | "sqlite";

/**
 * Factory for creating Event Repository implementations based on database type
 * Supports MySQL, PostgreSQL, and SQLite repositories
 */
export class EventRepositoryFactory {
  /**
   * Create and return the appropriate Event Repository
   * @param type - The database type: "mysql", "postgres", or "sqlite"
   * @returns The corresponding IEventRepository implementation
   * @throws Error if an unsupported database type is provided
   */
  static createRepository(type: EventRepositoryType): IEventRepository {
    switch (type) {
      case "mysql":
        return new MysqlEventRepository();
      case "postgres":
        return new PostgresEventRepository();
      case "sqlite":
        return new SqliteEventRepository();
      default:
        throw new Error(`Unsupported event repository type: ${type}`);
    }
  }

  /**
   * Get all supported repository types
   * @returns Array of supported database types
   */
  static getSupportedTypes(): EventRepositoryType[] {
    return ["mysql", "postgres", "sqlite"];
  }

  /**
   * Check if a given type is supported
   * @param type - The database type to check
   * @returns true if the type is supported, false otherwise
   */
  static isSupported(type: string): type is EventRepositoryType {
    return ["mysql", "postgres", "sqlite"].includes(type);
  }
}
