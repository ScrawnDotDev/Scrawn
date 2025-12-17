# Agent Guidelines for Scrawn Backend

## Commands

- **Test all**: `bun test` or `vitest`
- **Test single file**: `vitest src/__tests__/unit/path/to/test.test.ts`
- **Test with UI**: `bun run test:ui`
- **Dev server**: `bun run dev:backend` (auto-reload on port 8069)
- **Generate protobuf**: `bun run gen` (from proto/ directory)
- **DB migrations**: `bunx drizzle-kit push`

## Code Style

- **Runtime**: Bun with TypeScript ESNext, strict mode enabled
- **Imports**: Use `type` keyword for type-only imports (e.g., `import type { Foo } from "..."`)
- **Types**: Always use explicit types for function parameters and return values; avoid `any`
- **Error handling**: Use custom error classes (APIKeyError, StorageError, etc.) with static factory methods; always include error type, message, and optional originalError
- **Validation**: Use Zod schemas for all request validation; catch ZodError and convert to domain errors
- **Logging**: Use logger from `errors/logger` with `logOperationInfo` and `logOperationError`; include operation name and context
- **Testing**: Use Vitest with mocks via `vi.fn()`; mock database transactions in beforeEach; test success, validation errors, and database errors
- **Naming**: camelCase for variables/functions, PascalCase for classes/types/enums, SCREAMING_SNAKE_CASE for constants
- **Database**: Use Drizzle ORM with transactions; validate all inputs before DB operations; handle unique constraint violations explicitly
