import { z } from "zod";

const DATA_TABLE_NAMES = [
  "users",
  "sessions",
  "tags",
  "expressions",
  "metadata",
] as const;

const OPERATOR_MAP = {
  0: "EQ",
  1: "EQ",
  2: "GT",
  3: "GTE",
  4: "LT",
  5: "LTE",
  6: "NEQ",
  7: "CONTAINS",
} as const;

const LOGICAL_MAP = {
  0: "AND",
  1: "AND",
  2: "OR",
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
        .transform((v) => LOGICAL_MAP[v as keyof typeof LOGICAL_MAP]),
      conditionsList: z.array(filterConditionSchema).default([]),
      groupsList: z.array(filterGroupSchema).default([]),
    })
    .transform((v) => ({
      logical: v.logical,
      conditions: v.conditionsList,
      groups: v.groupsList,
    }))
);

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
