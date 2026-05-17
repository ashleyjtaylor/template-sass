---
name: environment
description: Environment configuration and secrets management
metadata:
  tags: environment, configuration, env, secrets
---

# Environment Configuration in Node.js

## Loading Environment Files

Use Node.js built-in `--env-file` flag to load environment variables:

```bash
# Load from .env file
node --env-file=.env app.ts

# Load multiple env files (later files override earlier ones)
node --env-file=.env --env-file=.env.local app.ts
```

### Programmatic API

Load environment files programmatically with `process.loadEnvFile()`:

```typescript
import { loadEnvFile } from 'node:process';

// Load .env from current directory
loadEnvFile();

// Load specific file
loadEnvFile('.env.local');
```

## Environment Variables Validation

Use [Zod](https://github.com/colinhacks/zod) for validation. Parse once at module load so a misconfigured environment fails loudly at startup, not on the first request:

```typescript
import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  API_KEY: z.string().min(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
```

## Branch on APP_ENV, not on bespoke transport flags

Use `APP_ENV` (`local | staging | production`) for environment-conditional logic — selecting a transport, picking a provider, swapping a stub. Don't invent a new env var when the existing one already tells you which environment you're in:

```ts
// BAD — second source of truth that can drift from APP_ENV
MAIL_TRANSPORT=ses

const transport = env.MAIL_TRANSPORT === 'ses'
  ? new SESTransport()
  : new MailPitTransport()

// GOOD — single source of truth, no new var to keep in sync
const transport = env.APP_ENV === 'local'
  ? new MailPitTransport()
  : new SESTransport()
```

This is about **provider/transport selection**, not configuration. Connection details, credentials, and feature toggles still get their own env vars (`DATABASE_URL`, `MAIL_FROM`, `RATE_LIMIT_ENABLED`, etc.) — those are the inputs the selected provider needs once it's chosen. The rule is: don't add an env var whose only job is to answer "which env am I in?" when `APP_ENV` already does that.

## .env File Structure

Organize .env files properly:

```bash
# .env.example - committed to git, documents all variables
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost:5432/db
API_KEY=your-api-key-here

# .env - local development, NOT committed
PORT=3000
DATABASE_URL=postgresql://dev:dev@localhost:5432/myapp
API_KEY=sk-dev-key-123

# .env.test - test environment
DATABASE_URL=postgresql://test:test@localhost:5432/myapp_test
```

## Secrets in Production

Never commit secrets to version control. Use a secrets management service appropriate for your infrastructure:

**Cloud Provider Services:**
- [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/)

**Container Orchestration:**
- Docker Swarm Secrets

**CI/CD Platforms:**
- GitHub Actions Secrets

These services inject secrets as environment variables at runtime, keeping them out of your codebase and version history.

## Feature Flags

Implement feature flags via environment:

```typescript
const features = {
  newDashboard: process.env.FEATURE_NEW_DASHBOARD === 'true',
  betaApi: process.env.FEATURE_BETA_API === 'true',
  darkMode: process.env.FEATURE_DARK_MODE === 'true',
};

export function isFeatureEnabled(feature: keyof typeof features): boolean {
  return features[feature] ?? false;
}
```
