import { type StorageAdapterType } from "../../interface/storage/Storage";
import { type EventType } from "../../interface/event/Event";
import { getPostgresDB } from "../db/postgres/db";
import {
  usersTable,
  eventsTable,
  serverlessFunctionCallEventsTable,
} from "../db/postgres/schema";
import { StorageError } from "../../errors/storage";

export class PostgresAdapter implements StorageAdapterType {
  name: string;
  connectionObject;
  event: EventType;

  constructor(event: EventType) {
    this.name = "SERVERLESS_FUNCTION_CALL";
    this.connectionObject = getPostgresDB();
    this.event = event;
  }

  async add(): Promise<void> {
    console.log(`Storing event in PostgreSQL: ${this.event.serialize()}`);

    switch (this.event.type) {
      case "SERVERLESS_FUNCTION_CALL":
        const { SQL: event_data } = this.event.serialize();

        try {
          const result = await this.connectionObject.transaction(
            async (txn) => {
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
                } else {
                  throw StorageError.constraintViolation(
                    "Failed to insert or update user",
                    e instanceof Error ? e : undefined,
                  );
                }
              }

              let reported_timestamp = event_data.reported_timestamp.toSQL();

              if (!reported_timestamp) {
                throw StorageError.invalidData(
                  "reported_timestamp is undefined",
                );
              }

              let [eventID] = await txn
                .insert(eventsTable)
                .values({
                  reported_timestamp,
                  userId: event_data.userId,
                })
                .returning({ id: eventsTable.id });

              if (!eventID) {
                throw StorageError.insertFailed(
                  "Failed to insert event and retrieve ID",
                );
              }

              await txn.insert(serverlessFunctionCallEventsTable).values({
                id: eventID.id,
                debitAmount: event_data.data.debitAmount,
              });
            },
          );
        } catch (e) {
          if (e instanceof StorageError) {
            throw e;
          }
          throw StorageError.transactionFailed(
            "Transaction failed while storing SERVERLESS_FUNCTION_CALL event",
            e instanceof Error ? e : undefined,
          );
        }
        break;
      default:
        throw StorageError.unknownEventType(this.event.type);
    }
  }
}
