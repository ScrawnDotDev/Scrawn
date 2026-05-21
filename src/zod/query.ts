import { z } from "zod";
import { QUERY_FIELD_NAMES } from "../interface/storage/Storage";
import { Operator, AggregationType, LogicalOperator } from "../gen/query/v1/query";
import { createFilterGroupSchema } from "./internals";

const OPERATOR_MAP = {
  [Operator.EQ]: "EQ",
  [Operator.GT]: "GT",
  [Operator.GTE]: "GTE",
  [Operator.LT]: "LT",
  [Operator.LTE]: "LTE",
  [Operator.NEQ]: "NEQ",
} as const;

const AGGREGATION_TYPE_MAP = {
  [AggregationType.SUM]: "SUM",
  [AggregationType.COUNT]: "COUNT",
} as const;

const LOGICAL_MAP = {
  [LogicalOperator.AND]: "AND",
  [LogicalOperator.OR]: "OR",
} as const;

const filterConditionSchema = z.object({
  field: z.enum(QUERY_FIELD_NAMES),
  operator: z
    .number()
    .int()
    .min(1)
    .max(6)
    .transform((v) => OPERATOR_MAP[v as keyof typeof OPERATOR_MAP]),
  value: z.string(),
});

const filterGroupSchema = createFilterGroupSchema(filterConditionSchema, LOGICAL_MAP);

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
  field: z.enum(QUERY_FIELD_NAMES),
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
