# Backend Tests

This directory contains all tests for the Scrawn backend, organized into unit tests and integration tests.

## Quick Start

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run with UI
npm test:ui

# Run only unit tests
npm test src/__tests__/unit

# Run only integration tests
npm test src/__tests__/integration
```

## Directory Structure

```
__tests__/
├── README.md                              # This file
├── TESTING.md                             # Detailed testing guide
├── helpers/                               # Shared test utilities
│   ├── error.ts                          # Error type checking helpers
│   └── storage.ts                        # Storage test utilities
├── unit/                                  # Unit tests (mocked, fast)
│   ├── routes/
│   │   ├── auth.getRoles.test.ts         # getRoles handler tests
│   │   └── auth.signJWT.test.ts          # JWT signing tests
│   ├── events/
│   │   └── ServerlessFunctionCallEvent.test.ts  # Event tests
│   ├── storage/
│   │   └── postgres.adapter.test.ts      # PostgreSQL adapter tests (mocked)
│   └── zod.auth.test.ts                  # Auth schema validation tests
└── integration/                           # Integration tests (real DB)
    ├── helpers.ts                        # Database fixtures
    └── storage/
        └── postgres.adapter.integration.test.ts  # Full adapter tests
```

## Test Types

### Unit Tests (`unit/`)

Fast, isolated tests using mocks and test doubles.

| Test | Location | Coverage |
|------|----------|----------|
| PostgreSQL Adapter (mocked) | `unit/storage/postgres.adapter.test.ts` | 21 tests |
| Auth Routes | `unit/routes/auth.*.test.ts` | 60+ tests |
| Events | `unit/events/ServerlessFunctionCallEvent.test.ts` | 69 tests |
| Schema Validation | `unit/zod.auth.test.ts` | Various |

**Run unit tests:**
```bash
npm test src/__tests__/unit
```

### Integration Tests (`integration/`)

Real database tests validating end-to-end behavior.

| Test | Location | Focus |
|------|----------|-------|
| PostgreSQL Adapter | `integration/storage/postgres.adapter.integration.test.ts` | Transaction atomicity, data persistence, concurrent operations |

**Run integration tests:**
```bash
# Set database URL first
export TEST_DATABASE_URL=postgres://user:pass@localhost:5432/scrawn_test

npm test src/__tests__/integration
```

## Key Test Files

### PostgreSQL Adapter Tests

**Unit Tests**: `unit/storage/postgres.adapter.test.ts`
- Tests adapter initialization
- Tests transaction flow with mocked database
- Tests duplicate user handling
- Tests error wrapping and StorageError behavior
- 21 focused unit tests

**Integration Tests**: `integration/storage/postgres.adapter.integration.test.ts`
- Tests actual database transactions
- Tests referential integrity
- Tests concurrent operations
- Tests data persistence
- Tests atomicity and rollback scenarios
- 40+ comprehensive integration tests

### Authentication Tests

**getRoles Handler**: `unit/routes/auth.getRoles.test.ts`
- Tests role extraction from user payload
- Tests error handling and wrapping
- Tests payload validation
- 30+ tests

**signJWT Handler**: `unit/routes/auth.signJWT.test.ts`
- Tests JWT payload construction
- Tests signing with correct algorithm
- Tests error handling
- Tests secret handling
- 62+ tests

### Event Tests

**ServerlessFunctionCallEvent**: `unit/events/ServerlessFunctionCallEvent.test.ts`
- Tests event construction
- Tests timestamp behavior
- Tests serialization
- Tests interface compatibility
- 69+ tests

## Running Specific Tests

```bash
# Run specific test file
npm test src/__tests__/unit/storage/postgres.adapter.test.ts

# Run tests matching pattern
npm test -- --grep "duplicate user"

# Run with coverage
npm test -- --coverage

# Run in watch mode
npm test -- --watch

# Run with UI (interactive dashboard)
npm test:ui
```

## Integration Test Setup

Integration tests require PostgreSQL. Set up:

```bash
# Option 1: Use TEST_DATABASE_URL
export TEST_DATABASE_URL=postgres://user:password@localhost:5432/scrawn_test

# Option 2: Use DATABASE_URL
export DATABASE_URL=postgres://user:password@localhost:5432/scrawn_test

# Then run tests
npm test src/__tests__/integration
```

### Database Requirements

- PostgreSQL 12+ running
- Test database created (e.g., `scrawn_test`)
- Schema tables migrated (users, events, serverless_function_call_events)
- User has create/drop/truncate permissions

### Troubleshooting Integration Tests

If integration tests are skipped:

1. Check PostgreSQL is running
2. Verify connection string in environment variable
3. Verify test database exists
4. Check that tables are created:
   ```sql
   \dt
   ```

## Test Helpers

### Error Helpers (`helpers/error.ts`)

Safe error type checking:

```typescript
import { isStorageError, isAuthError } from "./helpers/error";

try {
  // operation
} catch (error) {
  if (isStorageError(error)) {
    // Handle StorageError
  }
  if (isAuthError(error)) {
    // Handle AuthError
  }
}
```

### Database Helpers (`integration/helpers.ts`)

Fixtures and utilities for integration tests:

```typescript
import { createTestDatabase, generateTestUserId } from "./integration/helpers";

const testDB = createTestDatabase();
await testDB.connect();

// Seed data
const userId = generateTestUserId();
await testDB.seedUser(userId);

// Query data
const user = await testDB.getUser(userId);

// Cleanup
await testDB.clearAllTables();
await testDB.disconnect();
```

## Writing New Tests

### Unit Test Template

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MyComponent } from "../../path/to/component";

describe("MyComponent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("specific behavior", () => {
    it("should do something when X happens", () => {
      // Arrange
      const component = new MyComponent();
      
      // Act
      const result = component.method();
      
      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

### Integration Test Template

```typescript
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { createTestDatabase, generateTestUserId } from "../helpers";

let testDB;

describe("Feature Integration", () => {
  beforeAll(async () => {
    testDB = createTestDatabase();
    testDB.connect();
  });

  afterEach(async () => {
    await testDB.clearAllTables();
  });

  afterAll(async () => {
    await testDB.disconnect();
  });

  it("should work end-to-end", async () => {
    const userId = generateTestUserId();
    
    // Execute
    await feature(userId);
    
    // Verify
    const result = await testDB.getUser(userId);
    expect(result).not.toBeNull();
  });
});
```

## Test Statistics

- **Total Test Files**: 6 unit + 1 integration
- **Total Tests**: 200+ tests
- **Unit Tests**: ~180 tests
- **Integration Tests**: ~40 tests
- **Coverage**: Database adapters, auth handlers, events, validation

## Coverage Report

Generate HTML coverage report:

```bash
npm test -- --coverage
# Open coverage/index.html in browser
```

## CI/CD

Tests run automatically on:
- Pull requests
- Commits to `main` branch
- Releases

See `.github/workflows/test.yml` for CI configuration.

## Best Practices

1. ✅ Use descriptive test names
2. ✅ Follow AAA pattern (Arrange, Act, Assert)
3. ✅ Mock external dependencies in unit tests
4. ✅ Use real database in integration tests
5. ✅ Clean up after tests
6. ✅ Test edge cases and error paths
7. ✅ Don't test trivial getters/setters
8. ✅ Keep tests focused and isolated

## Common Issues

### Integration Tests Skip

**Cause**: Database not connected
**Fix**: Set `TEST_DATABASE_URL` environment variable

### Tests Timeout

**Cause**: Database operation takes too long
**Fix**: Increase timeout: `it("test", () => {}, 10000)`

### Mock Not Working

**Cause**: Mock defined after import
**Fix**: Define mocks before imports using `vi.mock()`

## Resources

- [TESTING.md](./TESTING.md) - Detailed testing guide
- [Vitest Documentation](https://vitest.dev)
- [Vitest UI](https://vitest.dev/guide/ui.html)
- Project test files for examples

## Contributing Tests

When adding new features:

1. Write unit tests first
2. Add integration tests for database operations
3. Ensure tests pass locally
4. Update TESTING.md if patterns change
5. Submit PR with tests included