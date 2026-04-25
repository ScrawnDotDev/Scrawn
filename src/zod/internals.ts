import { z } from "zod";

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
});

export type OnboardingCronSchemaType = z.infer<typeof onboardingCronSchema>;