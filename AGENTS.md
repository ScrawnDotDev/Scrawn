# Agent Guidelines for Scrawn Backend

## Commands

- **Dev server**: `bun run dev:backend` (gRPC - 8069, HTTP - 8070)
- **Generate protobuf**: `bun run gen` (from proto/ directory)
- **DB migrations**: `bunx drizzle-kit push`
- **Type Checking: `bunx tsgo`

## Code Style

- **Runtime**: Bun with TypeScript ESNext, strict mode enabled
- **Imports**: Use `type` keyword for type-only imports (e.g., `import type { Foo } from "..."`)
- **Types**: Always use explicit types for function parameters and return values; avoid `any`
- **Error handling**: Use custom error classes (APIKeyError, StorageError, etc.) with static factory methods; always include error type, message, and optional originalError
- **Validation**: Use Zod schemas for all request validation; catch ZodError and convert to domain errors
- **Logging**: Use logger from `errors/logger` with `logOperationInfo` and `logOperationError`; include operation name and context
- **Naming**: camelCase for variables/functions, PascalCase for classes/types/enums, SCREAMING_SNAKE_CASE for constants
- **Database**: Use Drizzle ORM with transactions; validate all inputs before DB operations; handle unique constraint violations explicitly
- **Dates**: Only use the DateTime module, never bother using the built in default date object. Also ALWAYS use utc(), do not try to do any local time fuckery
