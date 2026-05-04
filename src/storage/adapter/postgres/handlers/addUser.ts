import DodoPayments from "dodopayments";
import { getPostgresDB } from "../../../db/postgres/db";
import { usersTable } from "../../../db/postgres/schema";
import { StorageError } from "../../../../errors/storage";
import { type SqlRecord } from "../../../../interface/event/Event";
import { PaymentError } from "../../../../errors/payment";

let dodoClient: DodoPayments | null = null;

function getDodoClient(): DodoPayments {
  if (!dodoClient) {
    const apiKey = process.env.DODO_PAYMENTS_API_KEY;
    if (!apiKey) {
      throw PaymentError.missingApiKey();
    }
    dodoClient = new DodoPayments({
      bearerToken: apiKey,
      environment:
        process.env.NODE_ENV === "production" ? "live_mode" : "test_mode",
    });
  }
  return dodoClient;
}

export async function handleAddUser(
  event_data: SqlRecord<"USER">
): Promise<{ id: string }> {
  const connectionObject = getPostgresDB();

  const name = event_data.data.name;
  const email = event_data.data.email;

  if (!name || name.trim().length === 0) {
    throw StorageError.invalidData("Invalid name: value is required");
  }

  if (!email || email.trim().length === 0) {
    throw StorageError.invalidData("Invalid email: value is required");
  }

  try {
    const dodo = getDodoClient();
    const customer = await dodo.customers.create({
      email: email,
      name: name,
    });

    const paymentProviderUserId = customer.customer_id;

    await connectionObject.insert(usersTable).values({
      name: name,
      email: email,
      payment_provider_user_id: paymentProviderUserId,
    });
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message.includes("duplicate") || e.message.includes("unique"))
    ) {
      const [existingUser] = await connectionObject
        .select({ id: usersTable.id })
        .from(usersTable)
        .limit(1);

      if (existingUser) {
        return { id: existingUser.id };
      }
    }

    if (
      e &&
      typeof e === "object" &&
      "type" in e &&
      (e as any).name === "StorageError"
    ) {
      throw e;
    }

    throw StorageError.insertFailed(
      "Failed to insert user record",
      e instanceof Error ? e : new Error(String(e))
    );
  }

  const [newUser] = await connectionObject
    .select({ id: usersTable.id })
    .from(usersTable)
    .limit(1);

  if (!newUser?.id) {
    throw StorageError.emptyResult("User insert returned no record");
  }

  return { id: newUser.id };
}
