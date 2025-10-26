# Error Handling Quick Reference

## Quick Examples

### AuthError
```typescript
import { AuthError } from "src/errors";

// Missing or invalid headers
throw AuthError.missingHeader();
throw AuthError.invalidHeaderFormat();

// Token issues
throw AuthError.invalidToken(originalError);
throw AuthError.expiredToken(originalError);

// Payload problems
throw AuthError.invalidPayload("userId is required");
throw AuthError.malformedPayload(originalError);

// JWT signing
throw AuthError.signingError("Invalid secret key");
```

### EventError
```typescript
import { EventError } from "src/errors";

// Validation failures
throw EventError.validationFailed("userId must be UUID format", zodError);

// Unsupported types
throw EventError.unsupportedEventType("CUSTOM_EVENT_TYPE");

// Data issues
throw EventError.missingData("debitAmount");
throw EventError.invalidDataFormat("duration", "number");
throw EventError.invalidUserId("not-a-uuid");

// Processing errors
throw EventError.serializationError("JSON stringify failed", error);
throw EventError.invalidPayload("Event structure invalid");
```

## Pattern Template

### In Route Handlers
```typescript
import { EventError } from "src/errors";
import { ZodError } from "zod";

export function myRoute(req: MyRequest) {
  try {
    // 1. Validate
    let parsed;
    try {
      parsed = mySchema.parse(req);
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        throw EventError.validationFailed(issues, error);
      }
      throw EventError.unknown(error as Error);
    }

    // 2. Process
    try {
      // business logic
    } catch (error) {
      if (error instanceof EventError) {
        throw error;
      }
      throw EventError.unknown(error as Error);
    }

    return result;
  } catch (error) {
    console.error("Error:", error);
    if (error instanceof EventError) {
      throw error;
    }
    throw EventError.unknown(error as Error);
  }
}
```

## Error Types by Scenario

### Event Processing Errors
- **Event type unknown**: `EventError.unsupportedEventType()`
- **Event validation fails**: `EventError.validationFailed()`
- **Required data missing**: `EventError.missingData()`
- **Data format wrong**: `EventError.invalidDataFormat()`
- **Cannot serialize**: `EventError.serializationError()`
- **Invalid user ID**: `EventError.invalidUserId()`

### Authentication Errors
- **No header**: `AuthError.missingHeader()`
- **Bad header format**: `AuthError.invalidHeaderFormat()`
- **Token invalid**: `AuthError.invalidToken()`
- **Token expired**: `AuthError.expiredToken()`
- **Payload invalid**: `AuthError.invalidPayload()`
- **Cannot sign JWT**: `AuthError.signingError()`

## Error Code Reference

| Error Class | Codes Used |
|------------|-----------|
| AuthError | `Unauthenticated`, `Internal` |
| EventError | `InvalidArgument`, `Internal` |

- **InvalidArgument** = Client sent bad data (use for validation)
- **Unauthenticated** = Auth failed (missing/invalid token)
- **Internal** = Server error (serialization, signing, etc.)

## Debugging Tips

### See Original Error
```typescript
if (error instanceof EventError && error.originalError) {
  console.log("Root cause:", error.originalError.stack);
}
```

### Log Full Context
```typescript
catch (error) {
  if (error instanceof EventError) {
    console.error("=== Event Error ===");
    console.error("Type:", error.type);
    console.error("Message:", error.message);
    console.error("Original:", error.originalError?.message);
  }
}
```

## Common Patterns

### Wrapping External Library Errors
```typescript
try {
  const data = JSON.parse(jsonString);
} catch (error) {
  throw EventError.serializationError(
    "Failed to parse JSON",
    error as Error
  );
}
```

### Validation with Zod
```typescript
try {
  return schema.parse(data);
} catch (error) {
  if (error instanceof ZodError) {
    throw EventError.validationFailed(
      error.issues.map(i => `${i.path}: ${i.message}`).join("; "),
      error
    );
  }
}
```

### Type Checking
```typescript
// Always re-throw known errors
if (error instanceof EventError) {
  throw error;
}

// Wrap unknown errors
throw EventError.unknown(error as Error);
```

## Files Location

- `AuthError`: `src/errors/auth.ts`
- `EventError`: `src/errors/event.ts`
- All exports: `src/errors/index.ts`
- Full docs: `ERROR_HANDLING.md`
