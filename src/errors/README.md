# Error Handling System - Complete Overview

## Summary

A comprehensive, production-ready error handling system has been added to your backend, mirroring the pattern established by `AuthError`. Three error classes are now available with full TypeScript support, proper ConnectRPC integration, and extensive documentation.

## Error Classes

### 1. AuthError (Existing)
Located in `src/errors/auth.ts`

Handles authentication and JWT-related errors:
- Missing/invalid headers
- Token validation, expiration, and signing
- Payload validation

```typescript
throw AuthError.missingHeader();
throw AuthError.invalidToken(originalError);
throw AuthError.expiredToken();
throw AuthError.signingError("details");
```

### 2. EventError (New)
Located in `src/errors/event.ts`

Handles event processing and registration errors:
- Invalid payloads
- Unsupported event types
- Validation failures
- Serialization errors
- Missing or invalid data

```typescript
throw EventError.unsupportedEventType("CUSTOM_TYPE");
throw EventError.validationFailed("details", zodError);
throw EventError.serializationError("details", error);
throw EventError.missingData("fieldName");
```

## Architecture

All error classes follow this proven pattern:

```
1. Enum           → Define specific error types
2. Interface      → Define constructor parameters
3. Class          → Extend ConnectError with metadata
4. Static Methods → Factory functions for easy creation
```

**Example Structure:**

```typescript
export enum MyErrorType {
  ERROR_ONE = "ERROR_ONE",
  ERROR_TWO = "ERROR_TWO",
  UNKNOWN = "UNKNOWN",
}

export interface MyErrorContext {
  type: MyErrorType;
  message: string;
  originalError?: Error;
  code: Code;
}

export class MyError extends ConnectError {
  readonly type: MyErrorType;
  readonly originalError?: Error;

  constructor(context: MyErrorContext) {
    super(context.message, context.code);
    this.type = context.type;
    this.originalError = context.originalError;
    Object.setPrototypeOf(this, MyError.prototype);
  }

  static errorOne(): MyError {
    return new MyError({
      type: MyErrorType.ERROR_ONE,
      message: "Description",
      code: Code.InvalidArgument,
    });
  }
}
```

## Error Codes Used

| Code | Usage | Used By |
|------|-------|---------|
| `Code.InvalidArgument` | Invalid client input | Event, Validation |
| `Code.Unauthenticated` | Auth failed | Auth |
| `Code.Internal` | Server-side error | All classes |

## Usage Patterns

### Pattern 1: In Route Handlers

```typescript
import { EventError } from "src/errors";
import { ZodError } from "zod";

export function myRoute(req: MyRequest) {
  try {
    // Validate
    let parsed;
    try {
      parsed = mySchema.parse(req);
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues
          .map(i => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        throw EventError.validationFailed(issues, error);
      }
      throw EventError.validationFailed("Unknown error", error as Error);
    }

    // Process business logic
    try {
      // ... your logic ...
    } catch (error) {
      if (error instanceof EventError) {
        throw error; // Re-throw specific errors
      }
      throw EventError.unknown(error as Error); // Wrap unexpected
    }

    return result;
  } catch (error) {
    console.error("Route error:", error);

    // Re-throw EventError with proper logging
    if (error instanceof EventError) {
      console.error(`[${error.type}] ${error.message}`);
      throw error;
    }

    throw EventError.unknown(error as Error);
  }
}
```

### Pattern 2: Wrapping Library Errors

```typescript
try {
  const result = externalLibrary.process(data);
} catch (error) {
  throw EventError.serializationError(
    "External library failed",
    error as Error
  );
}
```


## Importing Errors

### Option 1: Individual Imports
```typescript
import { EventError } from "src/errors/event";
import { AuthError } from "src/errors/auth";
```

### Option 2: Centralized Import
```typescript
import {
  AuthError,
  AuthErrorType,
  EventError,
  EventErrorType,
} from "src/errors";
```

## Files Overview

| File | Purpose |
|------|---------|
| `src/errors/auth.ts` | Authentication errors (existing) |
| `src/errors/event.ts` | Event processing errors (new) |
| `src/errors/index.ts` | Centralized exports (new) |
| `src/routes/events/registerEvent.ts` | Example implementation (updated) |
| `ERROR_HANDLING.md` | Comprehensive documentation |
| `ERROR_QUICK_REF.md` | Quick reference guide |
| `ERRORS_ADDED.md` | Implementation details |

## Documentation

### ERROR_HANDLING.md
Complete guide covering:
- Detailed error class descriptions
- Error context interfaces
- ConnectRPC error codes
- Best practices (5 key principles)
- Template for creating new error types
- Error flow in routes
- Testing strategies
- Debugging techniques

### ERROR_QUICK_REF.md
Quick reference with:
- Quick usage examples
- Common patterns
- Scenario-based error selection
- Error code reference table
- Debugging tips
- File locations

### ERRORS_ADDED.md
Implementation summary with:
- File-by-file breakdown
- Key features
- Usage examples
- Migration guide
- Benefits

## Best Practices

### ✅ DO

1. **Use specific error types:**
   ```typescript
   throw EventError.validationFailed(details);
   ```

2. **Preserve original errors:**
   ```typescript
   throw EventError.serializationError("details", error as Error);
   ```

3. **Provide context:**
   ```typescript
   throw EventError.missingData("userId");
   ```

4. **Re-throw specific errors:**
   ```typescript
   if (error instanceof EventError) {
     throw error;
   }
   ```

5. **Log at boundaries:**
   ```typescript
   console.error(`[${error.type}] ${error.message}`);
   ```

### ❌ DON'T

1. **Use generic errors:**
   ```typescript
   // Bad
   throw new Error("Something went wrong");
   ```

2. **Lose error context:**
   ```typescript
   // Bad
   throw EventError.serializationError("Failed");
   ```

3. **Use vague messages:**
   ```typescript
   // Bad
   throw EventError.validationFailed("Error");
   ```

4. **Catch and swallow:**
   ```typescript
   // Bad
   try { ... } catch(e) { }
   ```

5. **Mix error styles:**
   ```typescript
   // Bad
   throw new Error(...);
   throw EventError.unknown(...);
   ```

## Creating New Error Types

When you need a specialized error class:

1. Create `src/errors/yourname.ts`
2. Follow the pattern from EventError
3. Define error types enum
4. Create context interface
5. Extend ConnectError
6. Implement static factory methods
7. Export from `src/errors/index.ts`

See `ERROR_HANDLING.md` for the full template.

## Type Safety

All error classes provide full TypeScript support:

```typescript
// Type-safe error checks
if (error instanceof EventError) {
  console.log(error.type);      // ✓ EventErrorType
  console.log(error.message);   // ✓ string
  console.log(error.originalError); // ✓ Error | undefined
}

// Factory methods are type-safe
const err = EventError.validationFailed("msg"); // ✓ EventError
```

## Example: Complete Route Implementation

```typescript
import type { RegisterEventRequest } from "../../gen/event/v1/event_pb";
import { eventSchema } from "../../zod/event";
import { type EventType } from "../../interface/event";
import { ServerlessFunctionCallEvent } from "../../classes/event";
import { EventError } from "../../errors/event";
import { ZodError } from "zod";

export function registerEvent(req: RegisterEventRequest) {
  try {
    // 1. Validate
    let eventSkeleton;
    try {
      eventSkeleton = eventSchema.parse(req);
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        throw EventError.validationFailed(issues, error);
      }
      throw EventError.validationFailed("Unknown error", error as Error);
    }

    // 2. Create event
    let event: EventType;
    try {
      switch (eventSkeleton.type) {
        case "SERVERLESS_FUNCTION_CALL":
          event = new ServerlessFunctionCallEvent(
            eventSkeleton.userId,
            eventSkeleton.data
          );
          break;
        default:
          throw EventError.unsupportedEventType(eventSkeleton.type);
      }
    } catch (error) {
      if (error instanceof EventError) throw error;
      throw EventError.unknown(error as Error);
    }

    // 3. Serialize
    try {
      const serialized = event.serialize();
      console.log("Serialized:", serialized);
    } catch (error) {
      throw EventError.serializationError(
        "Failed to serialize",
        error as Error
      );
    }

    return { success: true };
  } catch (error) {
    console.error("Register event error:", error);

    if (error instanceof EventError) {
      console.error(`[${error.type}] ${error.message}`);
      throw error;
    }

    throw EventError.unknown(error as Error);
  }
}
```

## Migration Checklist

- [ ] Review ERROR_HANDLING.md
- [ ] Review ERROR_QUICK_REF.md
- [ ] Check example in registerEvent.ts
- [ ] Update existing routes to use EventError
- [ ] Create additional error types as needed
- [ ] Update tests for error scenarios
- [ ] Add error monitoring/logging

## No Breaking Changes

✅ All existing code continues to work
✅ AuthError is unchanged
✅ New error types are purely additive
✅ Can migrate gradually

## Next Steps

1. Read the comprehensive documentation
2. Use errors in new routes
3. Gradually migrate existing routes
4. Create specialized error types as needed
5. Add error metrics/monitoring

---

**Questions?** See ERROR_HANDLING.md for detailed explanations or ERROR_QUICK_REF.md for quick examples.
