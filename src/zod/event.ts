import { z } from "zod";
import { DateTime } from "luxon";
import { USER_ID_CONFIG } from "../config/identifiers";
import { fetchTagAmount } from "../utils/fetchTagAmount";
import { parseAndEvaluateExpr } from "../utils/parseExpr";
import { EventType, BasicUsageType } from "../gen/event/v1/event";
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
  userId: USER_ID_CONFIG.validator,
  reportedTimestamp: z
    .number()
    .int()
    .transform((ts) => DateTime.fromSeconds(ts, { zone: "utc" })),
  eventId: z.uuid(),
  idempotencyKey: z.string().min(1),
});

const BasicUsageDataSchema: z.ZodType<BasicUsageEventData> = z
  .object({
    basicUsageType: z.union([
      z
        .literal(BasicUsageType.BASIC_USAGE_TYPE_UNSPECIFIED)
        .transform(() => "RAW" as const),
      z.literal(BasicUsageType.RAW).transform(() => "RAW" as const),
      z
        .literal(BasicUsageType.MIDDLEWARE_CALL)
        .transform(() => "MIDDLEWARE_CALL" as const),
    ]),
    amount: z.number().optional(),
    tag: z.string().optional(),
    expr: z.string().optional(),
    metadata: z.string().optional(),
  })
  .transform(async (v): Promise<BasicUsageEventData> => {
    let debitAmount: number;
    if (v.tag) {
      debitAmount = await fetchTagAmount(v.tag, `Tag not found: ${v.tag}`);
    } else if (v.expr) {
      debitAmount = await parseAndEvaluateExpr(v.expr);
    } else {
      debitAmount = v.amount ?? 0;
    }
    return {
      basicUsageType: v.basicUsageType,
      debitAmount,
      metadata: v.metadata ? parseMetadata(v.metadata) : undefined,
    };
  });

const AITokenUsageDataSchema: z.ZodType<AITokenUsageEventData> = z
  .object({
    model: z.string().min(1),
    provider: z.string().optional().default("unknown"),
    inputTokens: z.number().int().min(0),
    inputCacheTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
    inputAmount: z.number().optional(),
    inputTag: z.string().optional(),
    inputExpr: z.string().optional(),
    inputCacheAmount: z.number().optional(),
    inputCacheTag: z.string().optional(),
    inputCacheExpr: z.string().optional(),
    outputCacheTokens: z.number().int().min(0),
    outputCacheAmount: z.number().optional(),
    outputCacheTag: z.string().optional(),
    outputCacheExpr: z.string().optional(),
    outputAmount: z.number().optional(),
    outputTag: z.string().optional(),
    outputExpr: z.string().optional(),
    metadata: z.string().optional(),
  })
  .transform(async (v): Promise<AITokenUsageEventData> => {
    const tokenContext = {
      inputTokens: v.inputTokens,
      inputCacheTokens: v.inputCacheTokens,
      outputTokens: v.outputTokens,
      outputCacheTokens: v.outputCacheTokens,
    };

    let inputDebitAmount: number;
    if (v.inputTag) {
      inputDebitAmount = await fetchTagAmount(
        v.inputTag,
        `Input tag not found: ${v.inputTag}`
      );
    } else if (v.inputExpr) {
      inputDebitAmount = await parseAndEvaluateExpr(v.inputExpr, tokenContext);
    } else {
      inputDebitAmount = v.inputAmount ?? 0;
    }

    let inputCacheDebitAmount: number;
    if (v.inputCacheTag) {
      inputCacheDebitAmount = await fetchTagAmount(
        v.inputCacheTag,
        `Input cache tag not found: ${v.inputCacheTag}`
      );
    } else if (v.inputCacheExpr) {
      inputCacheDebitAmount = await parseAndEvaluateExpr(
        v.inputCacheExpr,
        tokenContext
      );
    } else {
      inputCacheDebitAmount = v.inputCacheAmount ?? 0;
    }

    let outputCacheDebitAmount: number;
    if (v.outputCacheTag) {
      outputCacheDebitAmount = await fetchTagAmount(
        v.outputCacheTag,
        `Output cache tag not found: ${v.outputCacheTag}`
      );
    } else if (v.outputCacheExpr) {
      outputCacheDebitAmount = await parseAndEvaluateExpr(
        v.outputCacheExpr,
        tokenContext
      );
    } else {
      outputCacheDebitAmount = v.outputCacheAmount ?? 0;
    }

    let outputDebitAmount: number;
    if (v.outputTag) {
      outputDebitAmount = await fetchTagAmount(
        v.outputTag,
        `Output tag not found: ${v.outputTag}`
      );
    } else if (v.outputExpr) {
      outputDebitAmount = await parseAndEvaluateExpr(
        v.outputExpr,
        tokenContext
      );
    } else {
      outputDebitAmount = v.outputAmount ?? 0;
    }

    return {
      model: v.model,
      provider: v.provider,
      inputTokens: v.inputTokens,
      inputCacheTokens: v.inputCacheTokens,
      outputTokens: v.outputTokens,
      outputCacheTokens: v.outputCacheTokens,
      inputDebitAmount,
      inputCacheDebitAmount,
      outputCacheDebitAmount,
      outputDebitAmount,
      metadata: v.metadata ? parseMetadata(v.metadata) : undefined,
    };
  });

const RegisterEventBasicUsage = BaseEvent.extend({
  type: z
    .literal(EventType.BASIC_USAGE)
    .transform(() => "BASIC_USAGE" as const),
  basicUsage: BasicUsageDataSchema,
});

const StreamEventBasicUsage = BaseEvent.extend({
  type: z
    .literal(EventType.BASIC_USAGE)
    .transform(() => "BASIC_USAGE" as const),
  basicUsage: BasicUsageDataSchema,
});

const StreamEventAITokenUsage = BaseEvent.extend({
  type: z
    .literal(EventType.AI_TOKEN_USAGE)
    .transform(() => "AI_TOKEN_USAGE" as const),
  aiTokenUsage: AITokenUsageDataSchema,
});

export const registerEventSchema = RegisterEventBasicUsage;
export type RegisterEventSchemaType = z.output<typeof registerEventSchema>;

export const streamEventSchema = z.union([
  StreamEventBasicUsage,
  StreamEventAITokenUsage,
]);
export type StreamEventSchemaType = z.output<typeof streamEventSchema>;
