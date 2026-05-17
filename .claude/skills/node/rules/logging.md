---
name: logging
description: Logging and debugging patterns
metadata:
  tags: logging, debugging, observability, pino
---

# Logging in Node.js

## Use Pino

Use [pino](https://github.com/pinojs/pino) for fast, structured JSON logging:

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

logger.info({ userId: user.id }, 'User created');
logger.error({ err, orderId: order.id }, 'Failed to process payment');
```

## Log Levels

Use appropriate log levels:

```typescript
// DEBUG - detailed information for debugging
logger.debug({ itemId: item.id, step: 'validation' }, 'Processing item');

// INFO - general operational information
logger.info({ userId: user.id }, 'User created');

// WARN - unexpected but handled situations
logger.warn({ currentRate: 95, limit: 100 }, 'Rate limit approaching');

// ERROR - errors that need attention
logger.error({ err, orderId: order.id }, 'Failed to process payment');
```

## Transports

Pino uses transports to process logs outside the main thread. Transports handle formatting, filtering, and sending logs to external services.

### Pretty Printing for Development

Use [pino-pretty](https://github.com/pinojs/pino-pretty) for human-readable output during development:

```bash
node app.ts | pino-pretty
```

Or configure programmatically:

```typescript
import pino from 'pino';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
});
```

### Multiple Transports

Send logs to multiple destinations:

```typescript
import pino from 'pino';

const logger = pino({
  transport: {
    targets: [
      {
        target: 'pino-pretty',
        options: { colorize: true },
        level: 'info',
      },
      {
        target: 'pino/file',
        options: { destination: '/var/log/app.log' },
        level: 'error',
      },
    ],
  },
});
```

### Available Transports

- [pino-pretty](https://github.com/pinojs/pino-pretty) - Human-readable formatting
- [pino-elasticsearch](https://github.com/pinojs/pino-elasticsearch) - Send to Elasticsearch
- [pino-loki](https://github.com/Julien-R44/pino-loki) - Send to Grafana Loki
- [pino-datadog](https://github.com/ovhemert/pino-datadog) - Send to Datadog

## Child Loggers

Create child loggers with bound context:

```typescript
const requestLogger = logger.child({
  requestId: req.id,
  userId: req.user?.id,
});

requestLogger.info('Processing request');
requestLogger.info({ itemId }, 'Item processed');
```

## Redaction

Use pino's built-in redaction for sensitive fields:

```typescript
const logger = pino({
  redact: ['password', 'token', 'apiKey', 'req.headers.authorization'],
});

// Sensitive values are replaced with [Redacted]
logger.info({ password: 'secret123' }, 'User login');
// Output: {"password":"[Redacted]","msg":"User login"...}
```

## Avoid Logging Sensitive Data

Never log credentials, tokens, or personal data:

```typescript
// BAD - logging sensitive data
logger.info({ email, password }, 'User login');

// GOOD - log only safe identifiers
logger.info({ email }, 'User login');
```
