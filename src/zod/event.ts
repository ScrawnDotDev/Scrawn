import { z } from "zod";
import { USER_ID_CONFIG } from "../config/identifiers";
import { getPostgresDB } from "../storage/db/postgres/db";
import { tagsTable } from "../storage/db/postgres/schema";
import { eq } from "drizzle-orm";
import { EventError } from "../errors/event";

const BaseEvent = z.object({
  type: z.number(), // overwritten later by discriminators
  userId: USER_ID_CONFIG.validator,
});

const SDKCallEvent = BaseEvent.extend({
  type: z.literal(1).transform(() => "SDK_CALL") as z.ZodType<"SDK_CALL">,
  data: z
    .object({
      case: z.literal("sdkCall"),
      value: z
        .object({
          sdkCallType: z.union([
            z.literal(1).transform(() => "RAW") as z.ZodType<"RAW">,
            z
              .literal(2)
              .transform(
                () => "MIDDLEWARE_CALL",
              ) as z.ZodType<"MIDDLEWARE_CALL">,
          ]),
          debit: z.union([
            z.object({
              case: z.literal("amount"),
              value: z.number().min(0),
            }),
            z.object({
              case: z.literal("tag"),
              value: z.string(),
            }),
          ]),
        })
        .transform(async (v) => {
          // If a tag is provided, fetch the integer value for the tag and store it into debitAmount
          if (v.debit.case === "tag") {
            const db = getPostgresDB();
            try {
              const [tagRow] = await db
                .select()
                .from(tagsTable)
                .where(eq(tagsTable.tag, v.debit.value))
                .limit(1);

              if (!tagRow) {
                throw EventError.validationFailed(
                  `Tag not found: ${v.debit.value}`,
                );
              }

              return { sdkCallType: v.sdkCallType, debitAmount: tagRow.amount };
            } catch (e) {
              if (e instanceof EventError) {
                throw e;
              }
              throw EventError.unknown(e as Error);
            }
          }
          // Otherwise use provided debitAmount (apply original transformation behavior)
          return {
            sdkCallType: v.sdkCallType,
            debitAmount: Math.floor(v.debit.value * 100),
          };
        }),
    })
    .transform((obj) => obj.value),
});

export const eventSchema = z.discriminatedUnion("type", [SDKCallEvent]);
export type EventSchemaType = z.infer<typeof eventSchema>;
