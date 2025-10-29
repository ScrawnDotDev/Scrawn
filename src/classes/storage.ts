import type { EventType } from "../interface/event/Event";
import type { PostgresStorageAdapterType } from "../interface/storage/Storage";
import {
  eventsTable,
  serverlessFunctionCallEventsTable,
  usersTable,
} from "../storage/db/schema";
import { getPostgresDB } from "../storage/postgres";

export class PostgresStorageAdapter implements PostgresStorageAdapterType {
  public readonly name = "POSTGRES";
  public connectionObject;

  constructor(public event: EventType) {
    this.connectionObject = getPostgresDB();
  }

  async add(): Promise<void> {
    console.log(`Storing event in PostgreSQL: ${this.event.serialize()}`);

    switch (this.event.type) {
      case "SERVERLESS_FUNCTION_CALL":
        const { POSTGRES: event_data } = this.event.serialize();
        const result = await this.connectionObject.transaction(async (txn) => {
          try {
            await txn.insert(usersTable).values({
              id: event_data.userId,
            });
          } catch (e) {
            if (
              e instanceof Error &&
              e.message.includes("duplicate key value")
            ) {
              // User already exists, ignore the error
            }
          }

          let reported_timestamp = event_data.reported_timestamp.toSQL();

          if (!reported_timestamp) {
            throw new Error("reported_timestamp is undefined");
          }

          let [eventID] = await txn
            .insert(eventsTable)
            .values({
              reported_timestamp,
              userId: event_data.userId,
            })
            .returning({ id: eventsTable.id });

          if (!eventID)
            throw new Error(
              "Failed to insert event and retrieve ID, SHOULD NOT HAPPEN",
            );
          console.log("HIT");
          await txn.insert(serverlessFunctionCallEventsTable).values({
            id: eventID.id,
            debitAmount: event_data.data.debitAmount,
          });
        });
        break;
      default:
        // replace with proper ConnectError wrapper
        throw new Error(
          `No storage logic implemented for event type: ${this.event.type}`,
        );
    }
  }
}
