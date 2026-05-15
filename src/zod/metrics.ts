import { z } from "zod";

export const metricsSchema = z.object({
  tokens: z.object({
    input: z.number().int(),
    input_cache: z.number().int(),
    output: z.number().int(),
  }),
  debit_amount: z.object({
    input: z.number().int(),
    input_cache: z.number().int(),
    output: z.number().int(),
  }),
});

export type Metrics = z.infer<typeof metricsSchema>;
