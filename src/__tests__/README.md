# Auth Module Tests

This directory contains comprehensive test suites for the authentication module. The tests are written using [Vitest](https://vitest.dev/), a blazing fast unit test framework powered by Vite.

## Test Files

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
npm run test -- errors.auth.test.ts
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

### Logger
- Logger is mocked in `interceptors.auth.test.ts` to prevent console output during tests
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
expect(() => getRoles(req, context)).toThrow(AuthError);
try {
  getRoles(req, context);
} catch (error) {
  expect(error).toBeInstanceOf(AuthError);
  expect((error as AuthError).type).toBe('INVALID_PAYLOAD');
}
```

### Mock Verification
Tests verify that mocked functions are called correctly:
```typescript
vi.mocked(jwt.sign).mockReturnValue(mockToken);
signJWT(req);
expect(jwt.sign).toHaveBeenCalledWith(payload, secret, options);
```

## Coverage Goals

- **errors.auth.ts**: 100% coverage of all error factory methods
- **routes/auth/signJWT.ts**: 100% coverage of JWT signing logic
- **routes/auth/getRoles.ts**: 100% coverage of role extraction
- **interceptors/auth.ts**: High coverage of authentication flow
- **zod/auth.ts**: Comprehensive schema validation coverage

## Best Practices

1. **Isolated Tests**: Each test is independent and can run in any order
2. **Clear Naming**: Test names clearly describe what is being tested
3. **Arrange-Act-Assert**: Tests follow the AAA pattern for clarity
4. **Mock Usage**: External dependencies are mocked to test in isolation
5. **Edge Cases**: Tests include boundary conditions and edge cases
6. **Error Handling**: Tests verify both success and failure paths
7. **Type Safety**: Tests maintain TypeScript type safety

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

## Troubleshooting

### Tests not running
- Ensure vitest is installed: `npm install`
- Check `vitest.config.ts` exists at project root
- Verify test files match the pattern `**/*.test.ts` or `**/*.spec.ts`

### Mock not working
- Import the vi object from vitest
- Use `vi.mock()` before importing the module to mock
- Clear mocks between tests with `vi.clearAllMocks()`

### Type errors in tests
- Ensure `@types/node` is installed for Node environment
- Import types from '@connectrpc/connect' for handler context
- Use `as any` or proper type casting for test fixtures

## Future Improvements

- Add integration tests with actual JWT library
- Add performance benchmarks for JWT signing
- Add end-to-end tests with mocked gRPC handlers
- Add snapshot testing for error messages
- Add property-based testing with fast-check for schema validation