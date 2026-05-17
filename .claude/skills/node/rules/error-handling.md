---
name: error-handling
description: Error handling patterns in Node.js
metadata:
  tags: errors, exceptions, try-catch, error-handling
---

## Never Swallow Errors

Never use empty catch blocks that hide errors:

```typescript
// BAD - error is swallowed
try {
  await riskyOperation();
} catch (error) {
  // Do nothing
}

// GOOD - handle or re-throw
try {
  await riskyOperation();
} catch (error) {
  logger.error({ err: error }, 'Operation failed');
  throw error;
}
```

## Error Cause Chain

Use the `cause` option to preserve error chains:

```typescript
try {
  await externalService.call();
} catch (error) {
  throw new Error('Service call failed', { cause: error });
}
```
