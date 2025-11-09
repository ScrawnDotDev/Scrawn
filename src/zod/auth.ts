import z from "zod/v3";

export const authSchema = z.object({
  id: z.string().uuid(),
  iat: z.number().int(),
});

export type AuthSchemaType = z.infer<typeof authSchema>;