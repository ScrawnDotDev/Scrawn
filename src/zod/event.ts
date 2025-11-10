import { z } from "zod";
import { USER_ID_CONFIG } from "../config/identifiers";

const BaseEvent = z.object({
  type: z.number(), // overwritten later by discriminators
  userId: USER_ID_CONFIG.validator,
});

const SDKCallEvent = BaseEvent.extend({
  type: z.literal(1).transform(() => "SDK_CALL") as z.ZodType<"SDK_CALL">,
  data: z
    .object({
      case: z.literal("sdkCall"),
      value: z.object({
        sdkCallType: z.union([
          z.literal(1).transform(() => "RAW") as z.ZodType<"RAW">,
          z
            .literal(2)
            .transform(() => "MIDDLEWARE_CALL") as z.ZodType<"MIDDLEWARE_CALL">,
        ]),
        debitAmount: z.number().transform((val) => Math.floor(val * 100)),
      }),
    })
    .transform((obj) => obj.value),
});

export const eventSchema = z.discriminatedUnion("type", [SDKCallEvent]);
export type EventSchemaType = z.infer<typeof eventSchema>;
