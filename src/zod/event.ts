import { z } from "zod";
import { USER_ID_CONFIG } from "../config/identifiers";
import { getPostgresDB } from "../storage/db/postgres/db";
import { tagsTable } from "../storage/db/postgres/schema";
import { eq } from "drizzle-orm";
import { EventError } from "../errors/event";
import { tagCache } from "../utils/tagCache";

const fetchTagAmount = async (
  tag: string,
  notFoundMessage: string
): Promise<number> => {
  const cachedAmount = tagCache.get(tag);
  if (cachedAmount !== undefined) {
    return cachedAmount;
  }

  const db = getPostgresDB();
  try {
    const [tagRow] = await db
      .select()
      .from(tagsTable)
      .where(eq(tagsTable.tag, tag))
      .limit(1);

    if (!tagRow) {
      throw EventError.validationFailed(notFoundMessage);
    }

    tagCache.set(tag, tagRow.amount);
    return tagRow.amount;
  } catch (e) {
    if (e instanceof EventError) {
      throw e;
    }
    throw EventError.unknown(e as Error);
  }
};

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
                () => "MIDDLEWARE_CALL"
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
          if (v.debit.case === "tag") {
            const debitAmount = await fetchTagAmount(
              v.debit.value,
              `Tag not found: ${v.debit.value}`
            );
            return { sdkCallType: v.sdkCallType, debitAmount };
          }

          return {
            sdkCallType: v.sdkCallType,
            debitAmount: Math.floor(v.debit.value * 100),
          };
        }),
    })
    .transform((obj) => obj.value),
});

const AITokenUsageEvent = BaseEvent.extend({
  type: z
    .literal(2)
    .transform(() => "AI_TOKEN_USAGE") as z.ZodType<"AI_TOKEN_USAGE">,
  data: z
    .object({
      case: z.literal("aiTokenUsage"),
      value: z
        .object({
          model: z.string().min(1),
          inputTokens: z.number().int().min(0),
          outputTokens: z.number().int().min(0),
          inputDebit: z.union([
            z.object({
              case: z.literal("inputAmount"),
              value: z.number().min(0),
            }),
            z.object({
              case: z.literal("inputTag"),
              value: z.string(),
            }),
          ]),
          outputDebit: z.union([
            z.object({
              case: z.literal("outputAmount"),
              value: z.number().min(0),
            }),
            z.object({
              case: z.literal("outputTag"),
              value: z.string(),
            }),
          ]),
        })
        .transform(async (v) => {
          // Process input debit
          let inputDebitAmount: number;
          if (v.inputDebit.case === "inputTag") {
            inputDebitAmount = await fetchTagAmount(
              v.inputDebit.value,
              `Input tag not found: ${v.inputDebit.value}`
            );
          } else {
            inputDebitAmount = Math.floor(v.inputDebit.value * 100);
          }

          // Process output debit
          let outputDebitAmount: number;
          if (v.outputDebit.case === "outputTag") {
            outputDebitAmount = await fetchTagAmount(
              v.outputDebit.value,
              `Output tag not found: ${v.outputDebit.value}`
            );
          } else {
            outputDebitAmount = Math.floor(v.outputDebit.value * 100);
          }

          return {
            model: v.model,
            inputTokens: v.inputTokens,
            outputTokens: v.outputTokens,
            inputDebitAmount,
            outputDebitAmount,
          };
        }),
    })
    .transform((obj) => obj.value),
});

export const registerEventSchema = SDKCallEvent;
export type RegisterEventSchemaType = z.infer<typeof registerEventSchema>;

export const streamEventSchema = AITokenUsageEvent;
export type StreamEventSchemaType = z.infer<typeof streamEventSchema>;
