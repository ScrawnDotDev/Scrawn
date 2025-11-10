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
import { RequestSDKCall } from "../../events/RequestSDKCall";
import { StorageAdapterFactory } from "../../factory";
import { eq, sum } from "drizzle-orm";

export class PostgresAdapter implements StorageAdapterType {
  name: string;
  connectionObject;
  event: EventType;
  apiKeyId?: string;

  constructor(event: EventType, apiKeyId?: string) {
    this.name = event.type;
    this.connectionObject = getPostgresDB();
    this.event = event;
    this.apiKeyId = apiKeyId;
  }

  async add(): Promise<{ id: string } | void> {
    const { SQL } = this.event.serialize();
    const event_data = SQL;

    switch (event_data.type) {
      case "SDK_CALL": {
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

            if (!this.apiKeyId) {
              throw StorageError.invalidData(
                "API key ID is required for event storage",
              );
            }

            let [eventID] = await txn
              .insert(eventsTable)
              .values({
                reported_timestamp,
                userId: event_data.userId,
                api_keyId: this.apiKeyId,
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

  async price(): Promise<number> {
    const { SQL } = this.event.serialize();
    const event_data = SQL;

    switch (event_data.type) {
      case "REQUEST_PAYMENT": {
        return await (
          await StorageAdapterFactory.getStorageAdapter(
            new RequestSDKCall(event_data.userId, null),
          )
        ).price();
      }
      case "REQUEST_SDK_CALL": {
        try {
          let smth = await this.connectionObject
            .select({
              price: sum(sdkCallEventsTable.debitAmount),
            })
            .from(sdkCallEventsTable)
            .leftJoin(eventsTable, eq(sdkCallEventsTable.id, eventsTable.id))
            .where(eq(eventsTable.userId, event_data.userId))
            .groupBy(eventsTable.userId);

          if (!smth[0] || !smth[0].price) {
            throw new Error("Failed to fetch price or smth");
          }

          return parseInt(smth[0]?.price);
        } catch (e) {
          throw StorageError.queryFailed(
            "Failed to query SDK_CALL event for pricing",
            e instanceof Error ? e : undefined,
          );
        }
      }
      default: {
        throw StorageError.unknownEventType(this.event.type);
      }
    }
  }
}
