import { z } from "zod";

export const createCheckoutLinkSchema = z.object({
  userId: z
    .string()
    .min(1, "User ID is required")
    .uuid("User ID must be a valid UUID"),
});

export type CreateCheckoutLinkSchemaType = z.infer<
  typeof createCheckoutLinkSchema
>;
