import { z } from "zod";
import { USER_ID_CONFIG } from "../config/identifiers";

export const authSchema = z.object({
  id: USER_ID_CONFIG.validator,
  roles: z.array(z.string()),
  iat: z.number().int(),
});

export type AuthPayload = z.infer<typeof authSchema>;
