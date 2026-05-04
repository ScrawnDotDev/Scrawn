import { z } from "zod";

export const registerUserSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name must be less than 255 characters"),
  email: z.email("Invalid email format"),
});

export type RegisterUserSchemaType = z.infer<typeof registerUserSchema>;
