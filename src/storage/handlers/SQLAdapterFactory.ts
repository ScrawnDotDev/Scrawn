import type { BaseServerlessFunctionCallHandler } from "./BaseServerlessFunctionCallHandler";
import { getPostgresDB } from "../db/postgres/db";
import { getMysqlDB } from "../db/mysql/db";
import { getSqliteDB } from "../db/sqlite/db";

type SQLAdapterType = "MYSQL" | "POSTGRES" | "SQLITE";

/**
 * Factory for creating SQL adapter handlers based on database type
 * Supports MySQL, PostgreSQL, and SQLite connectors
 */
export class SQLAdapterFactory {
  private static AdapterType: SQLAdapterType = "POSTGRES";

  /**
   * Set the default adapter type to be returned
   * @param type - The database type to set as default
   * @throws Error if an unsupported database type is provided
   */
  static setAdapter(type: SQLAdapterType): void {
    if (!this.isSupported(type)) {
      throw new Error(`Unsupported SQL adapter type: ${type}`);
    }
    this.AdapterType = type;
  }

  /**
   * Get the currently set default adapter type
   * @returns The current default adapter type
   */
  static getAdapter(): SQLAdapterType {
    return this.AdapterType;
  }

  /**
   * Create and return the appropriate SQL adapter handler
   * @param type - The database type: "mysql", "postgres", or "sqlite"
   * @returns The corresponding ServerlessFunctionCallHandler implementation
   * @throws Error if an unsupported database type is provided
   */
  static async getConnector() {
    const type = this.getAdapter();
    switch (type) {
      case "MYSQL":
        return await getMysqlDB();
      case "POSTGRES":
        return getPostgresDB();
      case "SQLITE":
        return getSqliteDB();
      default:
        throw new Error(`Unsupported SQL adapter type: ${type}`);
    }
  }

  /**
   * Get all supported adapter types
   * @returns Array of supported database types
   */
  private static getSupportedTypes(): SQLAdapterType[] {
    return ["MYSQL", "POSTGRES", "SQLITE"];
  }

  /**
   * Check if a given type is supported
   * @param type - The database type to check
   * @returns true if the type is supported, false otherwise
   */
  private static isSupported(type: string): type is SQLAdapterType {
    return ["MYSQL", "POSTGRES", "SQLITE"].includes(type);
  }
}
