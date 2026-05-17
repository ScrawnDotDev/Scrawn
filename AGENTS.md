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
- **Logging**: Use the `WideEventLogger` from `errors/logger`; call `logger.emit()` with a `WideEvent` object for request-scoped logging and `logger.lifecycle()` / `logger.lifecycleWarning()` for server lifecycle events
- **Naming**: camelCase for variables/functions, PascalCase for classes/types/enums, SCREAMING_SNAKE_CASE for constants
- **Database**: Use Drizzle ORM with transactions; validate all inputs before DB operations; handle unique constraint violations explicitly
- **Dates**: Only use the Luxon `DateTime` module; never use built-in `Date`. ALWAYS work in UTC:
  - `DateTime.utc()` — never `DateTime.now()` or `DateTime.local()`
  - `DateTime.fromISO(str, { zone: "utc" })` — never omit `{ zone: "utc" }` option
  - Use `dt.toUTC()` on any DateTime that might enter with a local zone
