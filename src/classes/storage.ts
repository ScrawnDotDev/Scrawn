import type { EventType } from "../interface/event/Event";
import type { PostgresStorageAdapterType } from "../interface/storage/Storage";

export class PostgresStorageAdapter implements PostgresStorageAdapterType {
  public readonly name = "POSTGRES";
  constructor(public event: EventType) {}

  async consume(): Promise<void> {
    // Implement the logic to store the event in PostgreSQL
    console.log(`Storing event in PostgreSQL: ${this.event.serialize()}`);
    // Placeholder for actual database interaction
  }
}
