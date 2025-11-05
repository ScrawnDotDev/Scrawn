import type { IEventRepository } from "../adapters/sql/IEventRepository";
import { MysqlEventRepository } from "../adapters/sql/MysqlEventRepository";
import { PostgresEventRepository } from "../adapters/sql/PostgresEventRepository";
import { SqliteEventRepository } from "../adapters/sql/SqliteEventRepository";
import { SQLAdapterFactory } from "./SQLAdapter";

type EventRepositoryType = "MYSQL" | "POSTGRES" | "SQLITE";

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
  static getRepository(): IEventRepository {
    const type = SQLAdapterFactory.getAdapter()
    switch (type) {
      case "MYSQL":
        return new MysqlEventRepository();
      case "POSTGRES":
        return new PostgresEventRepository();
      case "SQLITE":
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
    return ["MYSQL", "POSTGRES", "SQLITE"];
  }

  /**
   * Check if a given type is supported
   * @param type - The database type to check
   * @returns true if the type is supported, false otherwise
   */
  static isSupported(type: string): type is EventRepositoryType {
    return ["MYSQL", "POSTGRES", "SQLITE"].includes(type);
  }
}
