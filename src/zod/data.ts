import { z } from "zod";
import { Operator, LogicalOperator } from "../gen/data/v1/data";
import { createFilterGroupSchema } from "./internals";

const DATA_TABLE_NAMES = [
  "users",
  "sessions",
  "tags",
  "expressions",
  "metadata",
] as const;

const OPERATOR_MAP = {
  [Operator.EQ]: "EQ",
  [Operator.GT]: "GT",
  [Operator.GTE]: "GTE",
  [Operator.LT]: "LT",
  [Operator.LTE]: "LTE",
  [Operator.NEQ]: "NEQ",
  [Operator.CONTAINS]: "CONTAINS",
} as const;

const LOGICAL_MAP = {
  [LogicalOperator.AND]: "AND",
  [LogicalOperator.OR]: "OR",
} as const;

const filterConditionSchema = z.object({
  field: z.string(),
  operator: z
    .number()
    .int()
    .min(1)
    .max(7)
    .transform((v) => OPERATOR_MAP[v as keyof typeof OPERATOR_MAP]),
  value: z.string(),
});

const filterGroupSchema = createFilterGroupSchema(filterConditionSchema, LOGICAL_MAP);

const orderBySchema = z.object({
  field: z.string(),
  descending: z.boolean().default(false),
});

export const dataQuerySchema = z
  .object({
    table: z.enum(DATA_TABLE_NAMES),
    where: filterGroupSchema.optional(),
    orderByList: z.array(orderBySchema).default([]),
    limit: z.number().int().min(0).max(1000).default(100),
    offset: z.number().int().min(0).default(0),
  })
  .transform((v) => ({
    table: v.table,
    where: v.where ?? {
      logical: "AND" as const,
      conditions: [],
      groups: [],
    },
    orderBy: v.orderByList,
    limit: v.limit,
    offset: v.offset,
  }));

export type DataQueryRequest = z.output<typeof dataQuerySchema>;
