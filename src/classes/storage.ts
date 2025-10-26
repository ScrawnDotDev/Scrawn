import type { EventType } from "../interface/event/Event";
import type { PostgresStorageAdapterType } from "../interface/storage/Storage";
import { getPostgresDB } from "../storage/postgres";

export class PostgresStorageAdapter implements PostgresStorageAdapterType {
  public readonly name = "POSTGRES";
  public connectionObject;

  constructor(public event: EventType) {
    this.connectionObject = getPostgresDB();
  }

  async add(): Promise<void> {
    console.log(`Storing event in PostgreSQL: ${this.event.serialize()}`);
  }
}
