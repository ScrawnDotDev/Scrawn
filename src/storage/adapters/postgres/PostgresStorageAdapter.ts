import type { EventType } from "../../../interface/event/Event";
import type { PostgresStorageAdapterType } from "../../../interface/storage/Storage";
import { PostgresStorageError } from "../../../errors/postgres-storage";
import { StorageError } from "../../../errors/storage";
import { ServerlessFunctionCallHandler } from "./ServerlessFunctionCallHandler";
import { getPostgresDB } from "../../postgres";
import type { ServerlessFunctionCallEvent } from "../../../events/ServerlessFunctionCallEvent";

export class PostgresStorageAdapter implements PostgresStorageAdapterType {
  public readonly name = "POSTGRES";
  public connectionObject;

  constructor(public event: EventType) {
    this.connectionObject = getPostgresDB();
  }

  async add(): Promise<void> {
    try {
      console.log(`Storing event in PostgreSQL: ${this.event.serialize()}`);

      // Serialize and validate data
      let serialized;
      try {
        serialized = this.event.serialize();
      } catch (error) {
        throw StorageError.serializationFailed(
          `Failed to serialize event: ${error instanceof Error ? error.message : "Unknown error"}`,
          error as Error,
        );
      }

      // Extract PostgreSQL-specific data
      const postgresData = serialized.POSTGRES;
      if (!postgresData) {
        throw StorageError.invalidData(
          "Event serialization missing POSTGRES data",
        );
      }

      // Route to appropriate handler based on event type
      await this.routeEvent(postgresData);
    } catch (error) {
      // Re-throw StorageError and PostgresStorageError as-is
      if (
        error instanceof StorageError ||
        error instanceof PostgresStorageError
      ) {
        console.error(`[${error.type}] ${error.message}`);
        throw error;
      }

      // Wrap unexpected errors
      console.error("Unexpected error in PostgresStorageAdapter.add():", error);
      throw StorageError.unknown(error as Error);
    }
  }

  /**
   * Route event to appropriate handler based on event type
   */
  private async routeEvent(
    postgresData: ReturnType<
      ServerlessFunctionCallEvent["serialize"]
    >["POSTGRES"],
  ): Promise<void> {
    switch (this.event.type) {
      case "SERVERLESS_FUNCTION_CALL":
        await ServerlessFunctionCallHandler.handle(postgresData);
        break;

      default:
        throw StorageError.unknownEventType(this.event.type);
    }
  }
}
