import { z } from "zod";
import { USER_ID_CONFIG } from "../config/identifiers";

export const createCheckoutLinkSchema = z.object({
  userId: USER_ID_CONFIG.validator,
});

export type CreateCheckoutLinkSchemaType = z.infer<typeof createCheckoutLinkSchema>;
