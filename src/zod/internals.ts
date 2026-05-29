import { z } from "zod";

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
          conditionsList: z.array(conditionSchema).default([]),
          groupsList: z.array(filterGroupSchema).default([]),
        })
        .transform((v) => ({
          logical: v.logical,
          conditions: v.conditionsList,
          groups: v.groupsList,
        }))
  );
  return filterGroupSchema;
}

const cronField = z
  .string()
  .min(9, "Cron expression must be at least 9 characters")
  .max(100, "Cron expression must be less than 100 characters")
  .refine((val) => {
    const parts = val.trim().split(/\s+/);
    if (parts.length < 5 || parts.length > 6) return false;
    return true;
  }, "Cron expression must have 5 or 6 fields (minute hour day month weekday or with seconds)");

export const onboardingCronSchema = z.object({
  crons: z
    .array(cronField)
    .min(1, "At least one cron expression is required")
    .max(100, "Maximum 100 cron expressions allowed"),
  webhookUrl: z.url("Invalid webhook URL").or(z.literal("")),
  dodoLiveApiKey: z.string().min(1, "Dodo live API key is required").optional(),
  dodoTestApiKey: z.string().min(1, "Dodo test API key is required").optional(),
  dodoProductId: z.string().min(1, "Dodo product ID is required").optional(),
  dodoWebhookSecret: z
    .string()
    .min(1, "Dodo webhook secret is required")
    .optional(),
  currency: z.string().min(1, "Currency is required").optional(),
  redirectUrl: z.string().url("Redirect URL must be a valid URL").optional(),
});
