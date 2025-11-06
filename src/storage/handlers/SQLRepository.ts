import type { IEventRepository } from "../adapters/sql/IEventRepository";
import { GenericEventRepository } from "../adapters/sql/GenericEventRepository";
import { SQLAdapterFactory } from "./SQLAdapterFactory";

export type EventRepositoryType = "MYSQL" | "POSTGRES" | "SQLITE";

/**
 * Factory for getting Event Repository implementations
 * Returns GenericEventRepository with the configured database type
 */
export class SQLRepositoryFactory {
  /**
   * Get the appropriate Event Repository based on the current adapter type
   * @returns The corresponding IEventRepository implementation
   */
  static async getRepository(): Promise<IEventRepository> {
    const adapterType = SQLAdapterFactory.getAdapter();
    return new GenericEventRepository(adapterType);
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
