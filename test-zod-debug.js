const { z } = require("zod");

const createAPIKeySchema = z.object({
  name: z
    .string()
    .min(1, "API key name is required")
    .max(255, "API key name must be less than 255 characters"),
  expiresIn: z
    .union([z.number(), z.bigint()])
    .transform((val) => (typeof val === "bigint" ? Number(val) : val))
    .refine(
      (val) => val === Math.floor(val),
      "Expiration time must be an integer",
    )
    .refine((val) => val > 0, "Expiration time must be positive")
    .refine((val) => val >= 60, "Expiration time must be at least 60 seconds")
    .refine(
      (val) => val <= 365 * 24 * 60 * 60,
      "Expiration time cannot exceed 1 year",
    ),
});

const invalidRequest = {
  name: "",
  expiresIn: 3600,
};

const result = createAPIKeySchema.safeParse(invalidRequest);
console.log(JSON.stringify(result, null, 2));
