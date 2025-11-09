import { type StorageAdapterType } from "../../interface/storage/Storage";
import { type EventType } from "../../interface/event/Event";
import { getPostgresDB } from "../db/postgres/db";
import {
  usersTable,
  eventsTable,
  sdkCallEventsTable,
  apiKeysTable,
} from "../db/postgres/schema";
import { StorageError } from "../../errors/storage";

export class PostgresAdapter implements StorageAdapterType {
  name: string;
  connectionObject;
  event: EventType;

  constructor(event: EventType) {
    this.name = event.type;
    this.connectionObject = getPostgresDB();
    this.event = event;
  }

  async add(): Promise<{ id: string } | void> {
    const { SQL } = this.event.serialize();
    const event_data = SQL;

    switch (event_data.type) {
      case "SDK_CALL": {
        let smth = event_data;
        
        try {
          await this.connectionObject.transaction(async (txn) => {
            try {
              await txn
                .insert(usersTable)
                .values({
                  id: event_data.userId,
                })
                .onConflictDoNothing();
            } catch (e) {
              if (
                e instanceof Error &&
                e.message.includes('Failed query: insert into "users" ("id")')
              ) {
                // User already exists, ignore the error
              } else {
                throw StorageError.constraintViolation(
                  "Failed to insert or update user",
                  e instanceof Error ? e : undefined,
                );
              }
            }

            let reported_timestamp = event_data.reported_timestamp.toISO();
            console.log("---------->", reported_timestamp);

            if (!reported_timestamp) {
              throw StorageError.invalidData("reported_timestamp is undefined");
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

            if (event_data.type === "SDK_CALL") {
              const sdkData = event_data;
              await txn.insert(sdkCallEventsTable).values({
                id: eventID.id,
                type: sdkData.data.sdkCallType,
                debitAmount: sdkData.data.debitAmount,
              });
            }
            return { id: eventID };
          });
        } catch (e) {
          if (e instanceof StorageError) {
            throw e;
          }
          throw StorageError.transactionFailed(
            "Transaction failed while storing SDK_CALL event",
            e instanceof Error ? e : undefined,
          );
        }
        break;
      }

      case "ADD_KEY": {
        try {
          return await this.connectionObject.transaction(async (txn) => {
            let reported_timestamp = event_data.reported_timestamp.toISO();

            if (!reported_timestamp) {
              throw StorageError.invalidData("reported_timestamp is undefined");
            }

            const keyData = event_data;

            let [apiKeyRecord] = await txn
              .insert(apiKeysTable)
              .values({
                name: keyData.data.name,
                key: keyData.data.key,
                expiresAt: keyData.data.expiresAt,
              })
              .returning({ id: apiKeysTable.id });

            if (!apiKeyRecord) {
              throw StorageError.insertFailed(
                "Failed to insert API key and retrieve ID",
              );
            }
            return apiKeyRecord;
          });
        } catch (e) {
          if (e instanceof StorageError) {
            throw e;
          }
          throw StorageError.transactionFailed(
            "Transaction failed while storing ADD_KEY event",
            e instanceof Error ? e : undefined,
          );
        }
        break;
      }

      default:
        throw StorageError.unknownEventType(this.event.type);
    }
  }
}
