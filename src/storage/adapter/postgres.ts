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
    let event_data;

    try {
      const { SQL } = this.event.serialize();
      event_data = SQL;

      if (!event_data) {
        throw StorageError.serializationFailed(
          "Event serialization returned null or undefined",
        );
      }
    } catch (e) {
      console.error("[PostgresAdapter] Event serialization failed:", e);
      // Use duck typing instead of instanceof to work with mocked modules
      if (
        e &&
        typeof e === "object" &&
        "type" in e &&
        (e as any).name === "StorageError"
      ) {
        throw e;
      }
      throw StorageError.serializationFailed(
        "Failed to serialize event data",
        e instanceof Error ? e : new Error(String(e)),
      );
    }

    switch (event_data.type) {
      case "SDK_CALL": {
        try {
          // Validate event data structure
          if (!event_data.userId) {
            throw StorageError.invalidData(
              "Missing userId in SDK_CALL event data",
            );
          }

          if (!event_data.data) {
            throw StorageError.invalidData(
              "Missing data field in SDK_CALL event",
            );
          }

          if (!event_data.data.sdkCallType) {
            throw StorageError.invalidData(
              "Missing sdkCallType in SDK_CALL event data",
            );
          }

          if (typeof event_data.data.debitAmount !== "number") {
            throw StorageError.invalidData(
              `Invalid debitAmount type: expected number, got ${typeof event_data.data.debitAmount}`,
            );
          }

          // Allow negative debit amounts for refunds/credits

          console.log(
            `[PostgresAdapter] Processing SDK_CALL event for user: ${event_data.userId}`,
          );

          await this.connectionObject.transaction(async (txn) => {
            // Insert user if not exists
            try {
              await txn
                .insert(usersTable)
                .values({
                  id: event_data.userId,
                })
                .onConflictDoNothing();

              console.log(
                `[PostgresAdapter] User ${event_data.userId} ensured in database`,
              );
            } catch (e) {
              console.error(
                `[PostgresAdapter] User insert failed for ${event_data.userId}:`,
                e,
              );

              if (
                e instanceof Error &&
                e.message.includes('Failed query: insert into "users" ("id")')
              ) {
                // User already exists, ignore the error
                console.log(
                  `[PostgresAdapter] User ${event_data.userId} already exists, continuing`,
                );
              } else {
                throw StorageError.userInsertFailed(
                  event_data.userId,
                  e instanceof Error ? e : new Error(String(e)),
                );
              }
            }

            // Validate and prepare timestamp
            let reported_timestamp;
            try {
              reported_timestamp = event_data.reported_timestamp.toISO();
              console.log(
                `[PostgresAdapter] Reported timestamp: ${reported_timestamp}`,
              );
            } catch (e) {
              console.error(
                "[PostgresAdapter] Failed to convert timestamp to ISO:",
                e,
              );
              throw StorageError.invalidTimestamp(
                "Failed to convert reported_timestamp to ISO format",
                e instanceof Error ? e : new Error(String(e)),
              );
            }

            if (!reported_timestamp || reported_timestamp.trim().length === 0) {
              throw StorageError.invalidTimestamp(
                "Timestamp is undefined or empty after conversion",
              );
            }

            // Validate API key ID
            if (!this.apiKeyId) {
              throw StorageError.missingApiKeyId();
            }

            if (
              typeof this.apiKeyId !== "string" ||
              this.apiKeyId.trim().length === 0
            ) {
              throw StorageError.invalidData(
                `Invalid API key ID format: ${typeof this.apiKeyId}`,
              );
            }

            // Insert event
            let eventID;
            try {
              [eventID] = await txn
                .insert(eventsTable)
                .values({
                  reported_timestamp,
                  userId: event_data.userId,
                  api_keyId: this.apiKeyId,
                })
                .returning({ id: eventsTable.id });
            } catch (e) {
              console.error(
                `[PostgresAdapter] Event insert failed for user ${event_data.userId}:`,
                e,
              );
              throw StorageError.eventInsertFailed(
                `Failed to insert event for user ${event_data.userId}`,
                e instanceof Error ? e : new Error(String(e)),
              );
            }

            if (!eventID) {
              throw StorageError.emptyResult("Event insert returned no ID");
            }

            if (!eventID.id) {
              throw StorageError.emptyResult(
                "Event insert returned object without id field",
              );
            }

            console.log(
              `[PostgresAdapter] Event inserted with ID: ${eventID.id}`,
            );

            // Insert SDK call event
            try {
              const sdkData = event_data;
              await txn.insert(sdkCallEventsTable).values({
                id: eventID.id,
                type: sdkData.data.sdkCallType,
                debitAmount: sdkData.data.debitAmount,
              });

              console.log(
                `[PostgresAdapter] SDK call event inserted successfully with debit amount: ${sdkData.data.debitAmount}`,
              );
            } catch (e) {
              console.error(
                `[PostgresAdapter] SDK call event insert failed for event ID ${eventID.id}:`,
                e,
              );
              throw StorageError.insertFailed(
                `Failed to insert SDK call event for event ID ${eventID.id}`,
                e instanceof Error ? e : new Error(String(e)),
              );
            }

            return { id: eventID };
          });

          console.log(
            `[PostgresAdapter] SDK_CALL event processing completed successfully`,
          );
        } catch (e) {
          console.error("[PostgresAdapter] SDK_CALL transaction failed:", e);

          // Use duck typing instead of instanceof to work with mocked modules
          if (
            e &&
            typeof e === "object" &&
            "type" in e &&
            (e as any).name === "StorageError"
          ) {
            throw e;
          }

          throw StorageError.transactionFailed(
            "Transaction failed while storing SDK_CALL event",
            e instanceof Error ? e : new Error(String(e)),
          );
        }
        break;
      }

      case "ADD_KEY": {
        try {
          // Validate ADD_KEY event data
          if (!event_data.data) {
            throw StorageError.invalidData(
              "Missing data field in ADD_KEY event",
            );
          }

          if (
            !event_data.data.name ||
            typeof event_data.data.name !== "string"
          ) {
            throw StorageError.invalidData(
              "Invalid or missing 'name' in ADD_KEY event data",
            );
          }

          if (!event_data.data.key || typeof event_data.data.key !== "string") {
            throw StorageError.invalidData(
              "Invalid or missing 'key' in ADD_KEY event data",
            );
          }

          if (event_data.data.key.trim().length === 0) {
            throw StorageError.invalidData("API key cannot be empty");
          }

          console.log(
            `[PostgresAdapter] Processing ADD_KEY event for key: ${event_data.data.name}`,
          );

          return await this.connectionObject.transaction(async (txn) => {
            // Validate and prepare timestamp
            let reported_timestamp;
            try {
              reported_timestamp = event_data.reported_timestamp.toISO();
              console.log(
                `[PostgresAdapter] Reported timestamp: ${reported_timestamp}`,
              );
            } catch (e) {
              console.error(
                "[PostgresAdapter] Failed to convert timestamp to ISO:",
                e,
              );
              throw StorageError.invalidTimestamp(
                "Failed to convert reported_timestamp to ISO format",
                e instanceof Error ? e : new Error(String(e)),
              );
            }

            if (!reported_timestamp || reported_timestamp.trim().length === 0) {
              throw StorageError.invalidTimestamp(
                "Timestamp is undefined or empty after conversion",
              );
            }

            const keyData = event_data;

            let apiKeyRecord;
            try {
              [apiKeyRecord] = await txn
                .insert(apiKeysTable)
                .values({
                  name: keyData.data.name,
                  key: keyData.data.key,
                  expiresAt: keyData.data.expiresAt,
                })
                .returning({ id: apiKeysTable.id });
            } catch (e) {
              console.error(
                `[PostgresAdapter] API key insert failed for key ${keyData.data.name}:`,
                e,
              );

              // Check for unique constraint violations
              if (
                e instanceof Error &&
                (e.message.includes("unique") ||
                  e.message.includes("duplicate"))
              ) {
                throw StorageError.constraintViolation(
                  `API key with name '${keyData.data.name}' or key value already exists`,
                  e,
                );
              }

              throw StorageError.insertFailed(
                `Failed to insert API key '${keyData.data.name}'`,
                e instanceof Error ? e : new Error(String(e)),
              );
            }

            if (!apiKeyRecord) {
              throw StorageError.emptyResult(
                "API key insert returned no record",
              );
            }

            if (!apiKeyRecord.id) {
              throw StorageError.emptyResult(
                "API key insert returned object without id field",
              );
            }

            console.log(
              `[PostgresAdapter] API key inserted successfully with ID: ${apiKeyRecord.id}`,
            );

            return apiKeyRecord;
          });
        } catch (e) {
          console.error("[PostgresAdapter] ADD_KEY transaction failed:", e);

          // Use duck typing instead of instanceof to work with mocked modules
          if (
            e &&
            typeof e === "object" &&
            "type" in e &&
            (e as any).name === "StorageError"
          ) {
            throw e;
          }

          throw StorageError.transactionFailed(
            "Transaction failed while storing ADD_KEY event",
            e instanceof Error ? e : new Error(String(e)),
          );
        }
        break;
      }

      default: {
        console.error(
          `[PostgresAdapter] Unknown event type encountered: ${event_data.type}`,
        );
        throw StorageError.unknownEventType(event_data.type);
      }
    }
  }

  async price(): Promise<number> {
    let event_data;

    try {
      const { SQL } = this.event.serialize();
      event_data = SQL;

      if (!event_data) {
        throw StorageError.serializationFailed(
          "Event serialization returned null or undefined",
        );
      }
    } catch (e) {
      console.error(
        "[PostgresAdapter] Event serialization failed in price():",
        e,
      );
      // Use duck typing instead of instanceof to work with mocked modules
      if (
        e &&
        typeof e === "object" &&
        "type" in e &&
        (e as any).name === "StorageError"
      ) {
        throw e;
      }
      throw StorageError.serializationFailed(
        "Failed to serialize event data for price calculation",
        e instanceof Error ? e : new Error(String(e)),
      );
    }

    switch (event_data.type) {
      case "REQUEST_PAYMENT": {
        try {
          if (!event_data.userId) {
            throw StorageError.invalidData(
              "Missing userId in REQUEST_PAYMENT event",
            );
          }

          console.log(
            `[PostgresAdapter] Calculating price for REQUEST_PAYMENT, user: ${event_data.userId}`,
          );

          const storageAdapter = await StorageAdapterFactory.getStorageAdapter(
            new RequestSDKCall(event_data.userId, null),
          );

          if (!storageAdapter) {
            throw StorageError.unknown(
              new Error("Storage adapter factory returned null or undefined"),
            );
          }

          const price = await storageAdapter.price();

          if (typeof price !== "number" || isNaN(price)) {
            throw StorageError.priceCalculationFailed(
              event_data.userId,
              new Error(`Invalid price value returned: ${price}`),
            );
          }

          console.log(
            `[PostgresAdapter] Price calculated for user ${event_data.userId}: ${price}`,
          );

          return price;
        } catch (e) {
          console.error(
            `[PostgresAdapter] Failed to calculate price for REQUEST_PAYMENT:`,
            e,
          );

          // Use duck typing instead of instanceof to work with mocked modules
          if (
            e &&
            typeof e === "object" &&
            "type" in e &&
            (e as any).name === "StorageError"
          ) {
            throw e;
          }

          throw StorageError.priceCalculationFailed(
            "Failed to calculate price for REQUEST_PAYMENT event",
            e instanceof Error ? e : new Error(String(e)),
          );
        }
      }
      case "REQUEST_SDK_CALL": {
        try {
          if (!event_data.userId) {
            throw StorageError.invalidData(
              "Missing userId in REQUEST_SDK_CALL event",
            );
          }

          if (
            typeof event_data.userId !== "string" ||
            event_data.userId.trim().length === 0
          ) {
            throw StorageError.invalidData(
              `Invalid userId format: ${typeof event_data.userId}`,
            );
          }

          console.log(
            `[PostgresAdapter] Querying price for REQUEST_SDK_CALL, user: ${event_data.userId}`,
          );

          let result;
          try {
            result = await this.connectionObject
              .select({
                price: sum(sdkCallEventsTable.debitAmount),
              })
              .from(sdkCallEventsTable)
              .leftJoin(eventsTable, eq(sdkCallEventsTable.id, eventsTable.id))
              .where(eq(eventsTable.userId, event_data.userId))
              .groupBy(eventsTable.userId);
          } catch (e) {
            console.error(
              `[PostgresAdapter] Database query failed for user ${event_data.userId}:`,
              e,
            );
            throw StorageError.queryFailed(
              `Failed to query SDK_CALL events for user ${event_data.userId}`,
              e instanceof Error ? e : new Error(String(e)),
            );
          }

          if (!result) {
            console.error(
              `[PostgresAdapter] Query returned null/undefined for user ${event_data.userId}`,
            );
            throw StorageError.emptyResult(
              `Price query returned null for user ${event_data.userId}`,
            );
          }

          if (!Array.isArray(result)) {
            console.error(
              `[PostgresAdapter] Query result is not an array for user ${event_data.userId}:`,
              result,
            );
            throw StorageError.queryFailed(
              `Query result is not an array for user ${event_data.userId}`,
            );
          }

          if (result.length === 0 || !result[0]) {
            console.warn(
              `[PostgresAdapter] No SDK call events found for user ${event_data.userId}, returning 0`,
            );
            return 0;
          }

          const priceValue = result[0].price;

          if (priceValue === null || priceValue === undefined) {
            console.warn(
              `[PostgresAdapter] Price is null/undefined for user ${event_data.userId}, returning 0`,
            );
            return 0;
          }

          let parsedPrice: number;
          try {
            parsedPrice = parseInt(priceValue);
          } catch (e) {
            console.error(
              `[PostgresAdapter] Failed to parse price value '${priceValue}' for user ${event_data.userId}:`,
              e,
            );
            throw StorageError.priceCalculationFailed(
              event_data.userId,
              new Error(`Failed to parse price value: ${priceValue}`),
            );
          }

          if (isNaN(parsedPrice)) {
            throw StorageError.priceCalculationFailed(
              event_data.userId,
              new Error(`Price parsed to NaN from value: ${priceValue}`),
            );
          }

          if (parsedPrice < 0) {
            console.warn(
              `[PostgresAdapter] Negative price calculated for user ${event_data.userId}: ${parsedPrice}`,
            );
          }

          console.log(
            `[PostgresAdapter] Price calculated for user ${event_data.userId}: ${parsedPrice}`,
          );

          return parsedPrice;
        } catch (e) {
          console.error(
            `[PostgresAdapter] Failed to calculate price for REQUEST_SDK_CALL:`,
            e,
          );

          // Use duck typing instead of instanceof to work with mocked modules
          if (
            e &&
            typeof e === "object" &&
            "type" in e &&
            (e as any).name === "StorageError"
          ) {
            throw e;
          }

          throw StorageError.priceCalculationFailed(
            "Failed to calculate price for REQUEST_SDK_CALL event",
            e instanceof Error ? e : new Error(String(e)),
          );
        }
      }
      default: {
        console.error(
          `[PostgresAdapter] Unknown event type in price(): ${event_data.type}`,
        );
        throw StorageError.unknownEventType(event_data.type);
      }
    }
  }
}
