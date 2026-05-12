import { z } from "zod";

const ALLOWED_FIELDS = [
  "eventType",
  "reportedTimestamp",
  "ingestedTimestamp",
  "userId",
  "apiKeyId",
  "sdkCallType",
  "debitAmount",
  "creditAmount",
  "model",
  "inputTokens",
  "outputTokens",
  "inputDebitAmount",
  "outputDebitAmount",
] as const;

const OPERATOR_MAP = {
  0: "EQ",
  1: "EQ",
  2: "GT",
  3: "GTE",
  4: "LT",
  5: "LTE",
  6: "NEQ",
} as const;

const AGGREGATION_TYPE_MAP = {
  1: "SUM",
  2: "COUNT",
} as const;

const LOGICAL_MAP = {
  0: "AND",
  1: "AND",
  2: "OR",
} as const;

const filterConditionSchema = z.object({
  field: z.enum(ALLOWED_FIELDS),
  operator: z
    .number()
    .int()
    .min(1)
    .max(6)
    .transform((v) => OPERATOR_MAP[v as keyof typeof OPERATOR_MAP]),
  value: z.string(),
});

interface FilterGroupOutput {
  logical: "AND" | "OR";
  conditions: Array<z.output<typeof filterConditionSchema>>;
  groups: FilterGroupOutput[];
}

const filterGroupSchema: z.ZodType<FilterGroupOutput> = z.lazy(() =>
  z
    .object({
      logical: z
        .number()
        .int()
        .min(0)
        .max(2)
        .transform(
          (v) => LOGICAL_MAP[v as keyof typeof LOGICAL_MAP]
        ),
      conditionsList: z.array(filterConditionSchema).default([]),
      groupsList: z.array(filterGroupSchema).default([]),
    })
    .transform((v) => ({
      logical: v.logical,
      conditions: v.conditionsList,
      groups: v.groupsList,
    }))
);

const aggregationSchema = z.object({
  type: z
    .number()
    .int()
    .min(1)
    .max(2)
    .transform(
      (v) => AGGREGATION_TYPE_MAP[v as keyof typeof AGGREGATION_TYPE_MAP]
    ),
  field: z.string(),
});

const groupBySchema = z.object({
  field: z.enum(ALLOWED_FIELDS),
});

export const queryEventsSchema = z
  .object({
    where: filterGroupSchema.optional(),
    aggregation: aggregationSchema.optional(),
    groupBy: groupBySchema.optional(),
    limit: z.number().int().min(0).max(1000).default(100),
    offset: z.number().int().min(0).default(0),
  })
  .transform((v) => ({
    where: v.where ?? {
      logical: "AND" as const,
      conditions: [],
      groups: [],
    },
    aggregation: v.aggregation
      ? { type: v.aggregation.type, field: v.aggregation.field }
      : undefined,
    groupBy: v.groupBy?.field,
    limit: v.limit,
    offset: v.offset,
  }));

type QueryEventsSchemaType = z.output<typeof queryEventsSchema>;
