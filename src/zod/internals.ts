import { z } from "zod";

const currencyMap = {
  usd: "USD",
  eur: "EUR",
  gbp: "GBP",
  inr: "INR",
  jpy: "JPY",
} as const;

export interface FilterGroupOutput<C> {
  logical: "AND" | "OR";
  conditions: C[];
  groups: FilterGroupOutput<C>[];
}

export function createFilterGroupSchema<C extends z.ZodTypeAny>(
  conditionSchema: C,
  logicalMap: Record<number, "AND" | "OR">
): z.ZodType<FilterGroupOutput<z.output<C>>> {
  const filterGroupSchema: z.ZodType<FilterGroupOutput<z.output<C>>> = z.lazy(
    () =>
      z
        .object({
          logical: z
            .number()
            .int()
            .min(1)
            .max(2)
            .transform((v) => (logicalMap[v] ?? "AND") as "AND" | "OR"),
          conditions: z.array(conditionSchema).default([]),
          groups: z.array(filterGroupSchema).default([]),
        })
        .transform((v) => ({
          logical: v.logical,
          conditions: v.conditions,
          groups: v.groups,
        }))
  );
  return filterGroupSchema;
}

export const onboardingSchema = z.object({
  dodoLiveApiKey: z.string().min(1, "Dodo live API key is required"),
  dodoTestApiKey: z.string().min(1, "Dodo test API key is required"),
  currency: z
    .enum(["usd", "eur", "gbp", "inr", "jpy"])
    .transform((c) => currencyMap[c]),
  redirectUrl: z.url("Redirect URL must be a valid URL"),
});
