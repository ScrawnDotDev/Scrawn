# Quick Reference: Running Tests

## Quick Start

```bash
# Run all tests once
bun run test

# Run tests in watch mode
bun run test -- --watch

# Open interactive UI
bun run test:ui

# Generate coverage report
bun run test -- --coverage
```

## Common Commands

```bash
# Run specific test file
bun run test -- errors.auth.test.ts

# Run tests matching a pattern
bun run test -- --grep "should sign"

# Run single test
bun run test -- --grep "should sign a JWT with valid payload"

# Run with verbose output
bun run test -- --reporter=verbose

# Run tests sequentially (not parallel)
bun run test -- --threads=false
```

## Test Files

| File | Focus | Tests |
|------|-------|-------|
| `errors.auth.test.ts` | AuthError class and error handling | 184 |
| `routes.auth.signJWT.test.ts` | JWT signing functionality | 311 |
| `routes.auth.getRoles.test.ts` | Role extraction from context | 312 |
| `interceptors.auth.test.ts` | Auth interceptor middleware | 413 |
| `zod.auth.test.ts` | Schema validation | 465 |
| **TOTAL** | **All auth tests** | **1,685** |

## Debugging Tests

```bash
# Add debug output
bun run test -- --reporter=verbose

# Run single test with debugger
node --inspect-brk ./node_modules/.bin/vitest run routes.auth.signJWT.test.ts

# Watch specific test
bun run test -- --watch --grep "should sign a JWT"
```

### Valid UUID
```
12345678-1234-1234-1234-123456789012
```

### Valid Payload
```typescript
{
  id: "12345678-1234-1234-1234-123456789012",
  roles: ["admin", "user"],
  iat: 1688132800
}
```

### Mock Context
```typescript
const mockContext = {
  values: new Map() as any,
};
mockContext.values.set(userContextKey, userPayload);
```

## Test Patterns

### Testing Success Cases
```typescript
it("should do something", () => {
  // Arrange
  const input = { id: "123", roles: ["admin"] };
  
  // Act
  const result = someFunction(input);
  
  // Assert
  expect(result).toBe(expected);
});
```

### Testing Error Cases
```typescript
it("should throw error", () => {
  expect(() => {
    someFunction(invalidInput);
  }).toThrow(AuthError);
});
```

### Testing with Mocks
```typescript
(jwt.sign as any).mockReturnValue(token);
const result = signJWT(req);
expect(jwt.sign).toHaveBeenCalledWith(payload, secret, options);
```

### Testing with Zod
```typescript
const result = authSchema.safeParse(payload);
expect(result.success).toBe(true);
if (result.success) {
  expect(result.data).toEqual(expected);
}
```
