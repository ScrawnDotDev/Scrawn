# Test Suites

This directory contains comprehensive test suites for the backend modules. The tests are written using [Vitest](https://vitest.dev/), a blazing fast unit test framework powered by Vite.

## Test Organization

Tests are organized by module:
- **Auth Module** (`*.auth.test.ts`) - Authentication and JWT handling
- **Storage Module** (`storage/`) - Event storage, database operations, and error handling

## Auth Module Tests

### 1. `errors.auth.test.ts`
Tests for the `AuthError` class and error handling.

**Coverage:**
- Error creation methods (missing header, invalid format, invalid token, expired token, invalid payload, signing error, malformed payload, unknown error)
- Error type preservation and instanceof checks
- Error code validation (Unauthenticated vs Internal)
- Original error attachment and context preservation

**Key Test Scenarios:**
- All AuthError factory methods create correct error types
- Errors maintain proper prototype chain for instanceof checks
- Different error types have appropriate gRPC status codes
- Original errors are preserved for debugging

### 2. `routes.auth.signJWT.test.ts`
Tests for JWT signing functionality.

**Coverage:**
- Successful JWT signing with valid payloads
- Payload structure validation (id, roles, iat)
- Algorithm verification (HS256)
- Role array handling (empty, single, multiple)
- Error handling (missing payload, JWT signing failures)
- Edge cases (empty id, missing id, non-array roles)
- Token format validation

**Key Test Scenarios:**
- JWT tokens include id, roles (array), and iat (Unix timestamp)
- Uses HS256 algorithm for signing
- Handles missing or malformed payloads gracefully
- Converts non-array roles to empty array
- Includes current Unix timestamp as iat

### 3. `routes.auth.getRoles.test.ts`
Tests for the getRoles handler that extracts roles from JWT context.

**Coverage:**
- Successful role extraction from context
- Context payload validation
- Empty and multiple role handling
- Missing/null/undefined payload handling
- Role order preservation
- Special characters in role names
- Long token strings
- Context integration with userContextKey

**Key Test Scenarios:**
- Extracts roles array from context payload
- Returns empty array if roles property is missing or null
- Throws AuthError.invalidPayload when context payload is missing
- Preserves role order and special characters
- Handles edge cases like missing properties gracefully

### 4. `interceptors.auth.test.ts`
Tests for the authentication interceptor middleware.

**Coverage:**
- Unauthenticated endpoint bypassing (SignJWT)
- Authorization header validation
- Bearer token extraction
- JWT verification with secret
- Payload schema validation
- Context attachment with userContextKey
- Error propagation and logging
- Multiple role handling
- Different secret configurations

**Key Test Scenarios:**
- SignJWT endpoint bypasses authentication
- Missing Authorization header throws error
- Invalid header format (not "Bearer ...") throws error
- Token verification uses correct secret
- Expired tokens are rejected
- Invalid tokens are rejected
- Payload structure is validated against schema
- User payload is attached to context for downstream handlers
- Next handler receives modified request with context

### 5. `zod.auth.test.ts`
Tests for Zod schema validation of auth payloads.

**Coverage:**
- Valid payload validation
- UUID format validation
- Role array structure validation
- Timestamp (iat) validation
- Missing field detection
- Type validation (string, array, number)
- Extra field stripping
- Edge cases (negative iat, unicode characters, whitespace in roles)
- Schema parse vs safeParse behavior

**Key Test Scenarios:**
- Validates UUID format for id field
- Requires roles to be an array of strings
- Requires iat to be an integer
- Rejects non-UUID ids
- Rejects non-array roles
- Rejects non-integer iat values
- Strips extra fields from payload
- Handles unicode and special characters in role names

## Storage Module Tests

### 1. `storage/postgres.test.ts`
Tests for PostgreSQL database connection initialization.

**Coverage:**
- Singleton pattern verification
- Database URL validation
- Connection initialization
- Error handling for missing DATABASE_URL
- Multiple initialization calls

**Key Test Scenarios:**
- Throws error when DATABASE_URL is not defined
- Creates database connection when DATABASE_URL is provided
- Returns same instance on multiple calls (singleton pattern)
- Accepts DATABASE_URL as parameter

### 2. `storage/errors.storage.test.ts`
Tests for generic `StorageError` class and error handling.

**Coverage:**
- All storage error factory methods
- Error type and code preservation
- Original error attachment
- Prototype chain for instanceof checks
- Error message formatting

**Key Test Scenarios:**
- All error types create with correct properties
- Error codes match expected gRPC codes
- Original errors are preserved for debugging
- Messages include provided details
- Works across all error types

### 3. `storage/errors.postgres-storage.test.ts`
Tests for PostgreSQL-specific error handling and parsing.

**Coverage:**
- All PostgresStorageError factory methods
- PostgreSQL error message pattern matching
- Error type detection and parsing
- Original error preservation
- Constraint violation detection (duplicate key, foreign key, unique, not-null, check)
- Connection and timeout error detection
- Serialization error handling

**Key Test Scenarios:**
- Correctly identifies duplicate key violations
- Parses foreign key constraint violations
- Detects not-null constraint violations
- Identifies connection errors (ECONNREFUSED, ENOTFOUND)
- Recognizes timeout errors
- Handles connection pool exhaustion
- Parses invalid data type errors
- Falls back to UNKNOWN for unrecognized errors
- Preserves original error in all cases

### 4. `storage/adapters/postgres.adapter.test.ts`
Tests for `PostgresStorageAdapter` event routing and processing.

**Coverage:**
- Adapter initialization with events
- Event serialization
- Handler routing based on event type
- Error handling during serialization
- Missing POSTGRES data detection
- Unknown event type handling
- Error re-throwing behavior
- Event routing logic

**Key Test Scenarios:**
- Initializes with correct name and event
- Routes SERVERLESS_FUNCTION_CALL events correctly
- Serializes events before routing
- Throws StorageError on serialization failure
- Throws on missing POSTGRES data
- Throws on unknown event types
- Re-throws storage errors without wrapping
- Wraps unexpected errors in StorageError.unknown()
- Passes correct data to handlers
- Handles edge cases (zero amounts, large amounts, long IDs)

### 5. `storage/adapters/event.repository.test.ts`
Tests for `EventRepository` database operations.

**Coverage:**
- User insertion with duplicate key handling
- Event insertion and ID retrieval
- Serverless function call event details insertion
- Error parsing and wrapping
- Transaction handling
- Edge cases with various data types

**Key Test Scenarios:**
- Inserts new users successfully
- Skips insertion if user already exists (duplicate key)
- Throws on non-duplicate database errors
- Inserts events and returns generated IDs
- Throws when no ID is returned from database
- Throws on empty result sets
- Re-throws PostgresStorageError without wrapping
- Wraps random errors in PostgresStorageError
- Handles different timestamp formats
- Inserts event details with various debit amounts (zero, large, negative)
- Detects foreign key violations
- Handles multiple sequential operations

### 6. `storage/adapters/serverless.function.handler.test.ts`
Tests for `ServerlessFunctionCallHandler` transaction management and validation.

**Coverage:**
- Event data validation
- Timestamp conversion and validation
- Transaction execution and ordering
- Database repository operation calls
- Error handling and logging
- Edge cases with various data values

**Key Test Scenarios:**
- Validates and processes valid event data
- Throws when debitAmount is missing or undefined
- Throws when data object is missing
- Allows zero, large, and negative debit amounts
- Converts DateTime to SQL format correctly
- Throws on timestamp conversion failure
- Executes repository operations in correct order (insertOrSkipUser → insertEvent → insertServerlessFunctionCallEventDetails)
- Passes correct parameters to each repository method
- Re-throws PostgresStorageError without wrapping
- Wraps unexpected errors in PostgresStorageError.transactionFailed()
- Detects and handles connection errors appropriately
- Handles very long user IDs
- Handles decimal amounts with many decimal places
- Supports concurrent event processing
- Logs successful event storage with event ID and user ID

## Running Tests

### Run all tests
```bash
npm run test
# or with yarn
yarn test
# or with bun
bun run test
```

### Run tests in watch mode
```bash
npm run test -- --watch
```

### Run tests with UI
```bash
npm run test:ui
```

### Run specific test file
```bash
npm run test -- postgres.adapter.test.ts
```

### Run tests matching a pattern
```bash
npm run test -- --grep "should validate"
```

## Test Structure

Each test file follows this structure:

```typescript
describe('ModuleName', () => {
  describe('Feature/Scenario Group', () => {
    beforeEach(() => {
      // Setup before each test
    });

    it('should do something specific', () => {
      // Arrange: Set up test data
      // Act: Execute the function
      // Assert: Verify the result
    });
  });
});
```

## Mocking Strategy

### JWT Module
- `jsonwebtoken` is mocked in `routes.auth.signJWT.test.ts` and `interceptors.auth.test.ts`
- Mock returns are controlled per test to simulate different scenarios
- Supports mocking different error types (TokenExpiredError, JsonWebTokenError)

### Database and Storage
- Drizzle ORM and postgres client are mocked to avoid real database calls
- Transaction objects are mocked with chainable query builders
- EventRepository methods are mocked to simulate database operations
- Timestamp conversion is mocked to test error cases

### Logger
- Logger is mocked in relevant tests to prevent console output during tests
- Allows verification of logging calls if needed

### Context
- Context is mocked using Map() to simulate request context values
- userContextKey is used as the map key for user payloads

## Test Patterns

### Safe Validation with safeParse
Tests use Zod's `safeParse()` to validate schemas without throwing:
```typescript
const result = authSchema.safeParse(payload);
expect(result.success).toBe(true);
if (result.success) {
  expect(result.data).toEqual(expectedData);
}
```

### Error Testing
Tests verify specific error types and messages:
```typescript
try {
  await functionThatThrows();
  expect.fail('Should have thrown');
} catch (error) {
  expect(error).toBeInstanceOf(StorageError);
  expect((error as StorageError).type).toBe('SERIALIZATION_FAILED');
}
```

### Mock Verification
Tests verify that mocked functions are called correctly:
```typescript
const spy = vi.spyOn(Repository, 'method').mockResolvedValue('value');
await functionThatCalls();
expect(spy).toHaveBeenCalledWith(expectedParams);
```

## Coverage Goals

- **errors.auth.ts**: 100% coverage of all error factory methods
- **routes/auth/signJWT.ts**: 100% coverage of JWT signing logic
- **routes/auth/getRoles.ts**: 100% coverage of role extraction
- **interceptors/auth.ts**: High coverage of authentication flow
- **zod/auth.ts**: Comprehensive schema validation coverage
- **storage/postgres.ts**: 100% coverage of connection initialization
- **storage/adapters/postgres/PostgresStorageAdapter.ts**: 100% coverage of event routing
- **storage/adapters/postgres/EventRepository.ts**: 100% coverage of database operations
- **storage/adapters/postgres/ServerlessFunctionCallHandler.ts**: 100% coverage of transaction handling
- **errors/storage.ts**: 100% coverage of all error factory methods
- **errors/postgres-storage.ts**: 100% coverage of all error factory methods and parsing

## Best Practices

1. **Isolated Tests**: Each test is independent and can run in any order
2. **Clear Naming**: Test names clearly describe what is being tested
3. **Arrange-Act-Assert**: Tests follow the AAA pattern for clarity
4. **Mock Usage**: External dependencies are mocked to test in isolation
5. **Edge Cases**: Tests include boundary conditions and edge cases
6. **Error Handling**: Tests verify both success and failure paths
7. **Type Safety**: Tests maintain TypeScript type safety
8. **Useful Assertions**: Tests verify actual behavior, not just error types
9. **Realistic Scenarios**: Tests simulate real-world usage patterns
10. **No Trivial Tests**: Tests focus on regression prevention, not implementation details

## Common Test Utilities

### Valid UUID
```typescript
'12345678-1234-1234-1234-123456789012'
```

### Valid User Payload
```typescript
{
  id: '12345678-1234-1234-1234-123456789012',
  roles: ['admin', 'user'],
  iat: 1688132800
}
```

### Mock Context
```typescript
const mockContext = {
  values: new Map(),
};
mockContext.values.set(userContextKey, userPayload);
```

### Mock Transaction
```typescript
const createMockTransaction = () => {
  const insertMock = vi.fn().mockReturnThis();
  const valuesMock = vi.fn().mockReturnThis();
  const returningMock = vi.fn();
  
  return {
    insert: insertMock,
    values: valuesMock,
    returning: returningMock,
  };
};
```

## Troubleshooting

### Tests not running
- Ensure vitest is installed: `npm install`
- Check `vitest.config.ts` exists at project root
- Verify test files match the pattern `**/*.test.ts` or `**/*.spec.ts`

### Mock not working
- Import the vi object from vitest
- Use `vi.mock()` before importing the module to mock
- Clear mocks between tests with `vi.clearAllMocks()`
- Verify mock paths match the actual import paths in the code

### Type errors in tests
- Ensure `@types/node` is installed for Node environment
- Import types from '@connectrpc/connect' for handler context
- Use `as any` for complex mock objects that don't need full type safety

### Database mock issues
- Verify mock transaction object has all required chainable methods
- Ensure mocked `returning()` always resolves to an array or rejects
- Check that EventRepository methods properly handle mock results

## Future Improvements

- Add integration tests with actual PostgreSQL database
- Add performance benchmarks for event storage operations
- Add end-to-end tests with mocked gRPC handlers
- Add snapshot testing for error messages
- Add property-based testing with fast-check for data validation
- Add concurrent load testing for transaction handling