# Testing Guide

This document explains the test structure and how to run tests for the backend.

## Test Organization

Tests are organized into two main categories:

### Unit Tests (`unit/`)

Unit tests verify individual components in isolation using mocks and test doubles.

#### Structure
```
unit/
├── routes/          - Route handler tests
│   ├── auth.getRoles.test.ts
│   └── auth.signJWT.test.ts
├── events/          - Event class tests
│   └── ServerlessFunctionCallEvent.test.ts
├── storage/         - Storage adapter tests (mocked)
│   └── postgres.adapter.test.ts
└── zod.auth.test.ts - Schema validation tests
```

#### Running Unit Tests

```bash
# Run all unit tests
npm test

# Run specific unit test file
npm test src/__tests__/unit/routes/auth.signJWT.test.ts

# Run tests in watch mode
npm test -- --watch

# Run with UI
npm test:ui
```

### Integration Tests (`integration/`)

Integration tests verify components working together against a real PostgreSQL database.

#### Structure
```
integration/
├── helpers.ts       - Database setup and fixtures
├── storage/
│   └── postgres.adapter.integration.test.ts
```

#### Requirements

To run integration tests, you need:

1. **PostgreSQL** running locally or accessible via network
2. **TEST_DATABASE_URL** environment variable set, or **DATABASE_URL** as fallback
3. **Migrated database schema** (tables must exist)

#### Database Setup

```bash
# Set environment variable
export TEST_DATABASE_URL="postgres://user:password@localhost:5432/scrawn_test"

# Or use DATABASE_URL
export DATABASE_URL="postgres://user:password@localhost:5432/scrawn_test"
```

#### Running Integration Tests

```bash
# Run all tests (both unit and integration)
npm test

# Run only integration tests
npm test src/__tests__/integration

# Run specific integration test
npm test src/__tests__/integration/storage/postgres.adapter.integration.test.ts

# Run with watch mode
npm test -- --watch src/__tests__/integration
```

## Test Helpers

### Unit Test Helpers (`helpers/error.ts`)

Error checking utilities for tests:

- `isStorageError(error)` - Check if error is a StorageError
- `isAuthError(error)` - Check if error is an AuthError

### Integration Test Helpers (`integration/helpers.ts`)

Database fixture and utility functions:

- `TestDatabase` - Class for managing test database connections
- `generateTestUserId()` - Generate unique user IDs for tests
- `sleep(ms)` - Wait for specified milliseconds
- `createTestDatabase()` - Create and connect test database

#### TestDatabase API

```typescript
// Connection management
testDB.connect()           // Connect to database
testDB.disconnect()        // Close connection
testDB.getDB()            // Get Drizzle ORM instance

// Table management
testDB.clearAllTables()   // Clear all tables (in dependency order)

// Seeding
testDB.seedUser(userId)                          // Insert user
testDB.seedEvent(userId, timestamp?)             // Insert event
testDB.seedServerlessFunctionCallEvent(id, amt)  // Insert SFC event

// Queries
testDB.getUser(userId)                           // Get user by ID
testDB.getEvent(userId)                          // Get event by user ID
testDB.getServerlessFunctionCallEvent(eventId)   // Get SFC event by ID

// Counts
testDB.countUsers()                              // Count all users
testDB.countEvents()                             // Count all events
testDB.countServerlessFunctionCallEvents()       // Count SFC events
```

## Writing Tests

### Unit Test Template

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MyComponent } from "../path/to/component";

describe("MyComponent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("feature group", () => {
    it("should do something", () => {
      // Arrange
      const component = new MyComponent();
      
      // Act
      const result = component.doSomething();
      
      // Assert
      expect(result).toBe(expectedValue);
    });
  });
});
```

### Integration Test Template

```typescript
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { createTestDatabase, generateTestUserId } from "../helpers";

let testDB: TestDatabase;

describe("Feature Integration Tests", () => {
  beforeAll(async () => {
    testDB = createTestDatabase();
    testDB.connect();
    await testDB.clearAllTables();
  });

  afterEach(async () => {
    await testDB.clearAllTables();
  });

  afterAll(async () => {
    await testDB.disconnect();
  });

  describe("scenario", () => {
    it("should verify end-to-end behavior", async () => {
      const userId = generateTestUserId();
      
      // Execute operation
      await myFunction(userId);
      
      // Verify database state
      const user = await testDB.getUser(userId);
      expect(user).not.toBeNull();
    });
  });
});
```

## Test Coverage

Run coverage reports:

```bash
# Generate coverage report
npm test -- --coverage

# View HTML coverage report
npm test -- --coverage
# Check coverage/index.html
```

## CI/CD Integration

Tests are automatically run on:
- Pull requests
- Commits to main branch
- Release builds

See `.github/workflows/test.yml` for CI configuration.

## Debugging Tests

### Using VS Code Debugger

1. Add breakpoint in test file
2. Run in debug mode:
   ```bash
   npm test -- --inspect-brk src/__tests__/unit/routes/auth.signJWT.test.ts
   ```
3. Open `chrome://inspect` and connect to the process

### Using Test UI

```bash
npm test:ui
```

Opens Vitest UI showing test execution, failures, and code coverage.

### Verbose Logging

```bash
npm test -- --reporter=verbose
```

## Common Issues

### Integration Tests Skip on DB Connection Error

If integration tests are skipped, verify:
1. PostgreSQL is running
2. Connection string is correct
3. Test database exists
4. Tables are migrated

### Tests Timeout

Increase timeout for specific test:

```typescript
it("long-running test", async () => {
  // test code
}, 10000); // 10 second timeout
```

### Mock Not Working

Ensure mocks are set up before imports:

```typescript
vi.mock("../module", () => ({
  someFunction: vi.fn(),
}));

import { someFunction } from "../module";
```

## Best Practices

1. **Use descriptive test names** - Explain what is being tested
2. **Follow AAA pattern** - Arrange, Act, Assert
3. **One assertion per test** (when possible) - Makes failures clearer
4. **Mock external dependencies** - Keep tests isolated
5. **Clean up after tests** - Use afterEach/afterAll hooks
6. **Don't test trivial code** - Skip testing simple getters/setters
7. **Test edge cases** - Null, empty, boundary values
8. **Keep tests focused** - Test one behavior per test

## Resources

- [Vitest Documentation](https://vitest.dev)
- [Vitest UI](https://vitest.dev/guide/ui.html)
- [Test File Structure](https://vitest.dev/guide/features.html)