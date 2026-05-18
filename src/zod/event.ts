import { z } from "zod";
import { DateTime } from "luxon";
import { USER_ID_CONFIG } from "../config/identifiers";
import { fetchTagAmount } from "../utils/fetchTagAmount";
import { parseAndEvaluateExpr } from "../utils/parseExpr";
import { EventType, BasicUsageType } from "../gen/event/v1/event_pb";
import type {
  BasicUsageEventData,
  AITokenUsageEventData,
} from "../interface/event/Event";

function parseMetadata(val: string): Record<string, unknown> {
  try {
    return JSON.parse(val) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid JSON in metadata");
  }
}

const BaseEvent = z.object({
  type: z.number(),
  userid: USER_ID_CONFIG.validator,
  reportedtimestamp: z
    .number()
    .int()
    .transform((ts) => DateTime.fromSeconds(ts, { zone: "utc" })),
  eventid: z.uuid(),
  idempotencykey: z.string().min(1),
});

const BasicUsageDataSchema: z.ZodType<BasicUsageEventData> = z
  .object({
    basicusagetype: z.union([
      z
        .literal(BasicUsageType.BASIC_USAGE_TYPE_UNSPECIFIED)
        .transform(() => "RAW" as const),
      z.literal(BasicUsageType.RAW).transform(() => "RAW" as const),
      z
        .literal(BasicUsageType.MIDDLEWARE_CALL)
        .transform(() => "MIDDLEWARE_CALL" as const),
    ]),
    amount: z.number(),
    tag: z.string(),
    expr: z.string(),
    metadata: z.string().optional(),
  })
  .transform(async (v): Promise<BasicUsageEventData> => {
    let debitAmount: number;
    if (v.tag) {
      debitAmount = await fetchTagAmount(v.tag, `Tag not found: ${v.tag}`);
    } else if (v.expr) {
      debitAmount = await parseAndEvaluateExpr(v.expr);
    } else {
      debitAmount = v.amount;
    }
    return {
      basicUsageType: v.basicusagetype,
      debitAmount,
      metadata: v.metadata ? parseMetadata(v.metadata) : undefined,
    };
  });

const AITokenUsageDataSchema: z.ZodType<AITokenUsageEventData> = z
  .object({
    model: z.string().min(1),
    provider: z.string().optional().default("unknown"),
    inputtokens: z.number().int().min(0),
    inputcachetokens: z.number().int().min(0),
    outputtokens: z.number().int().min(0),
    inputamount: z.number(),
    inputtag: z.string(),
    inputexpr: z.string(),
    inputcacheamount: z.number(),
    inputcachetag: z.string(),
    inputcacheexpr: z.string(),
    outputamount: z.number(),
    outputtag: z.string(),
    outputexpr: z.string(),
    metadata: z.string().optional(),
  })
  .transform(async (v): Promise<AITokenUsageEventData> => {
    const tokenContext = {
      inputTokens: v.inputtokens,
      inputCacheTokens: v.inputcachetokens,
      outputTokens: v.outputtokens,
    };

    let inputDebitAmount: number;
    if (v.inputtag) {
      inputDebitAmount = await fetchTagAmount(
        v.inputtag,
        `Input tag not found: ${v.inputtag}`
      );
    } else if (v.inputexpr) {
      inputDebitAmount = await parseAndEvaluateExpr(v.inputexpr, tokenContext);
    } else {
      inputDebitAmount = v.inputamount;
    }

    let inputCacheDebitAmount: number;
    if (v.inputcachetag) {
      inputCacheDebitAmount = await fetchTagAmount(
        v.inputcachetag,
        `Input cache tag not found: ${v.inputcachetag}`
      );
    } else if (v.inputcacheexpr) {
      inputCacheDebitAmount = await parseAndEvaluateExpr(
        v.inputcacheexpr,
        tokenContext
      );
    } else {
      inputCacheDebitAmount = v.inputcacheamount;
    }

    let outputDebitAmount: number;
    if (v.outputtag) {
      outputDebitAmount = await fetchTagAmount(
        v.outputtag,
        `Output tag not found: ${v.outputtag}`
      );
    } else if (v.outputexpr) {
      outputDebitAmount = await parseAndEvaluateExpr(
        v.outputexpr,
        tokenContext
      );
    } else {
      outputDebitAmount = v.outputamount;
    }

    return {
      model: v.model,
      provider: v.provider,
      inputTokens: v.inputtokens,
      inputCacheTokens: v.inputcachetokens,
      outputTokens: v.outputtokens,
      inputDebitAmount,
      inputCacheDebitAmount,
      outputDebitAmount,
      metadata: v.metadata ? parseMetadata(v.metadata) : undefined,
    };
  });

const RegisterEventBasicUsage = BaseEvent.extend({
  type: z
    .literal(EventType.BASIC_USAGE)
    .transform(() => "BASIC_USAGE" as const),
  basicusage: BasicUsageDataSchema,
});

const StreamEventBasicUsage = BaseEvent.extend({
  type: z
    .literal(EventType.BASIC_USAGE)
    .transform(() => "BASIC_USAGE" as const),
  basicusage: BasicUsageDataSchema,
});

const StreamEventAITokenUsage = BaseEvent.extend({
  type: z
    .literal(EventType.AI_TOKEN_USAGE)
    .transform(() => "AI_TOKEN_USAGE" as const),
  aitokenusage: AITokenUsageDataSchema,
});

export const registerEventSchema = RegisterEventBasicUsage;
export type RegisterEventSchemaType = z.output<typeof registerEventSchema>;

export const streamEventSchema = z.union([
  StreamEventBasicUsage,
  StreamEventAITokenUsage,
]);
export type StreamEventSchemaType = z.output<typeof streamEventSchema>;
