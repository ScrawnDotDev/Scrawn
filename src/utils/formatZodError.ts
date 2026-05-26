import { ZodError } from "zod";

export type AppError = {
  type: string;
  message: string;
  name: string;
};

export function formatZodError(
  error: unknown,
  createError: (message: string) => AppError
): AppError {
  if (error instanceof ZodError) {
    const issues = error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    return createError(issues);
  }
  return createError(error instanceof Error ? error.message : String(error));
}
