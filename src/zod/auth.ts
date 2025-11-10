import { z } from "zod";

// More lenient UUID validation that accepts the format XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
// without strict version/variant bit validation
const uuidRegex =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const authSchema = z.object({
  id: z.string().regex(uuidRegex, "Invalid UUID format"),
  roles: z.array(z.string()),
  iat: z.number().int(),
});

export type AuthPayload = z.infer<typeof authSchema>;
