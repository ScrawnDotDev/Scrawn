import { z } from "zod";
import { DateTime } from "luxon";
import { USER_ID_CONFIG } from "../config/identifiers";
import { fetchTagAmount } from "../utils/fetchTagAmount";
import { parseAndEvaluateExpr } from "../utils/parseExpr";
import type {
  SDKCallEventData,
  AITokenUsageEventData,
} from "../interface/event/Event";

const BaseEvent = z.object({
  type: z.number(),
  userid: USER_ID_CONFIG.validator,
  reportedtimestamp: z
    .number()
    .int()
    .transform((ts) => DateTime.fromSeconds(ts)),
});

const SDKCallDataSchema: z.ZodType<SDKCallEventData> = z
  .object({
    sdkcalltype: z.union([
      z.literal(0).transform(() => "RAW" as const),
      z.literal(1).transform(() => "RAW" as const),
      z.literal(2).transform(() => "MIDDLEWARE_CALL" as const),
    ]),
    amount: z.number(),
    tag: z.string(),
    expr: z.string(),
  })
  .transform(async (v): Promise<SDKCallEventData> => {
    let debitAmount: number;
    if (v.tag) {
      debitAmount = await fetchTagAmount(v.tag, `Tag not found: ${v.tag}`);
    } else if (v.expr) {
      debitAmount = await parseAndEvaluateExpr(v.expr);
    } else {
      debitAmount = Math.floor(v.amount * 100);
    }
    return { sdkCallType: v.sdkcalltype, debitAmount };
  });

const AITokenUsageDataSchema: z.ZodType<AITokenUsageEventData> = z
  .object({
    model: z.string().min(1),
    inputtokens: z.number().int().min(0),
    outputtokens: z.number().int().min(0),
    inputamount: z.number(),
    inputtag: z.string(),
    inputexpr: z.string(),
    outputamount: z.number(),
    outputtag: z.string(),
    outputexpr: z.string(),
  })
  .transform(async (v): Promise<AITokenUsageEventData> => {
    let inputDebitAmount: number;
    if (v.inputtag) {
      inputDebitAmount = await fetchTagAmount(
        v.inputtag,
        `Input tag not found: ${v.inputtag}`
      );
    } else if (v.inputexpr) {
      inputDebitAmount = await parseAndEvaluateExpr(v.inputexpr);
    } else {
      inputDebitAmount = Math.floor(v.inputamount * 100);
    }

    let outputDebitAmount: number;
    if (v.outputtag) {
      outputDebitAmount = await fetchTagAmount(
        v.outputtag,
        `Output tag not found: ${v.outputtag}`
      );
    } else if (v.outputexpr) {
      outputDebitAmount = await parseAndEvaluateExpr(v.outputexpr);
    } else {
      outputDebitAmount = Math.floor(v.outputamount * 100);
    }

    return {
      model: v.model,
      inputTokens: v.inputtokens,
      outputTokens: v.outputtokens,
      inputDebitAmount,
      outputDebitAmount,
    };
  });

const RegisterEventSDKCall = BaseEvent.extend({
  type: z.literal(1).transform(() => "SDK_CALL" as const),
  sdkcall: SDKCallDataSchema,
});

const StreamEventSDKCall = BaseEvent.extend({
  type: z.literal(1).transform(() => "SDK_CALL" as const),
  sdkcall: SDKCallDataSchema,
});

const StreamEventAITokenUsage = BaseEvent.extend({
  type: z.literal(2).transform(() => "AI_TOKEN_USAGE" as const),
  aitokenusage: AITokenUsageDataSchema,
});

export const registerEventSchema = RegisterEventSDKCall;
export type RegisterEventSchemaType = z.output<typeof registerEventSchema>;

export const streamEventSchema = z.union([
  StreamEventSDKCall,
  StreamEventAITokenUsage,
]);
export type StreamEventSchemaType = z.output<typeof streamEventSchema>;
