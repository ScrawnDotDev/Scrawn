import { Code, ConnectError } from "@connectrpc/connect";

export enum UserErrorType {
  VALIDATION_FAILED = "VALIDATION_FAILED",
  CREATION_FAILED = "CREATION_FAILED",
  NOT_FOUND = "NOT_FOUND",
  ALREADY_EXISTS = "ALREADY_EXISTS",
  UNKNOWN = "UNKNOWN",
}

export interface UserErrorContext {
  type: UserErrorType;
  message: string;
  originalError?: Error;
  code: Code;
}

export class UserError extends ConnectError {
  readonly type: UserErrorType;
  readonly originalError?: Error;

  constructor(context: UserErrorContext) {
    super(context.message, context.code);
    this.name = "UserError";
    this.type = context.type;
    this.originalError = context.originalError;

    Object.setPrototypeOf(this, UserError.prototype);
  }

  static validationFailed(details: string, originalError?: Error): UserError {
    return new UserError({
      type: UserErrorType.VALIDATION_FAILED,
      message: `User validation failed: ${details}`,
      code: Code.InvalidArgument,
      originalError,
    });
  }

  static creationFailed(details?: string, originalError?: Error): UserError {
    return new UserError({
      type: UserErrorType.CREATION_FAILED,
      message: details
        ? `Failed to create user: ${details}`
        : "Failed to create user",
      code: Code.Internal,
      originalError,
    });
  }

  static notFound(userId?: string, originalError?: Error): UserError {
    return new UserError({
      type: UserErrorType.NOT_FOUND,
      message: userId ? `User not found: ${userId}` : "User not found",
      code: Code.NotFound,
      originalError,
    });
  }

  static alreadyExists(email?: string, originalError?: Error): UserError {
    return new UserError({
      type: UserErrorType.ALREADY_EXISTS,
      message: email ? `User already exists: ${email}` : "User already exists",
      code: Code.AlreadyExists,
      originalError,
    });
  }

  static unknown(originalError?: Error): UserError {
    const details = originalError?.message || "No details available";
    return new UserError({
      type: UserErrorType.UNKNOWN,
      message: `Unexpected user error: ${details}`,
      code: Code.Internal,
      originalError,
    });
  }
}