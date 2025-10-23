import { z } from "zod";

const BaseEvent = z.object({
  type: z.string(), // overwritten later by discriminators
  userId: z.uuid(),
});

const ServerlessEvent = BaseEvent.extend({
  type: z.literal(1).transform(() => "SERVERLESS_FUNCTION_CALL"),
  data: z.object({
    value: z.object({
      debitAmount: z.number(),
    }),
  }).transform((obj) => obj.value),
});

// JUST FOR DEMO PURPOSES
const SDKEvent = BaseEvent.extend({
  type: z.literal("SDK_CALL"),
  data: z.object({
    functionName: z.string(),
    duration: z.number(),
  }),
});

export const eventSchema = z.discriminatedUnion("type", [
  ServerlessEvent,
  SDKEvent,
]);
type EventSchemaType = z.infer<typeof eventSchema>;
