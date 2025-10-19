import z from "zod/v3";

export const authSchema = z.object({
  id: z.string().uuid(),
  roles: z.array(z.string()),
  iat: z.number(),
});
